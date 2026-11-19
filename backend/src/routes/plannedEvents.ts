import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { enrichPlannedEvent } from '../services/budget';
import { writeLog } from '../services/logger';

const router = Router();

router.use(authenticate);

const TYPES = [
  'BIRTHDAY',
  'CHRISTMAS',
  'ANNIVERSARY',
  'VACATION',
  'INSURANCE',
  'DOCUMENT',
  'MAINTENANCE',
  'CELEBRATION',
  'OTHER',
];

const round2 = (n: number) => Math.round(n * 100) / 100;

// GET /api/planned-events
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const events = await prisma.plannedEvent.findMany({
    where: { userId: req.userId, ...(req.query.includeInactive === 'true' ? {} : { active: true }) },
  });

  const reference = new Date();
  const enriched = events
    .map((e) => enrichPlannedEvent(e, reference))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  res.json({
    events: enriched,
    totalBudget: round2(enriched.reduce((s, e) => s + e.budgetAmount, 0)),
    totalSaved: round2(enriched.reduce((s, e) => s + e.savedAmount, 0)),
    totalMonthlyProvision: round2(enriched.reduce((s, e) => s + e.requiredMonthlySaving, 0)),
  });
});

// POST /api/planned-events
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, type, eventDate, yearlyRecurring, budgetAmount, savedAmount, fundId, notes } =
    req.body;

  if (!name?.trim() || !eventDate || budgetAmount == null) {
    res.status(400).json({ error: 'name, eventDate y budgetAmount son requeridos' });
    return;
  }
  if (type && !TYPES.includes(type)) {
    res.status(400).json({ error: `type debe ser uno de: ${TYPES.join(', ')}` });
    return;
  }
  if (fundId) {
    const fund = await prisma.fund.findFirst({ where: { id: fundId, userId: req.userId } });
    if (!fund) {
      res.status(400).json({ error: 'El fondo indicado no existe' });
      return;
    }
  }

  const event = await prisma.plannedEvent.create({
    data: {
      userId: req.userId!,
      name: name.trim(),
      type: type ?? 'OTHER',
      eventDate: new Date(eventDate),
      yearlyRecurring: yearlyRecurring !== undefined ? Boolean(yearlyRecurring) : true,
      budgetAmount: parseFloat(budgetAmount),
      savedAmount: savedAmount != null ? parseFloat(savedAmount) : 0,
      fundId: fundId || null,
      notes: notes?.trim() || null,
    },
  });

  res.status(201).json(enrichPlannedEvent(event));
});

// PATCH /api/planned-events/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.plannedEvent.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Evento no encontrado' });
    return;
  }

  const { name, type, eventDate, yearlyRecurring, budgetAmount, savedAmount, fundId, notes, active } =
    req.body;

  const event = await prisma.plannedEvent.update({
    where: { id: req.params.id },
    data: {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(type && TYPES.includes(type) ? { type } : {}),
      ...(eventDate ? { eventDate: new Date(eventDate) } : {}),
      ...(yearlyRecurring !== undefined ? { yearlyRecurring: Boolean(yearlyRecurring) } : {}),
      ...(budgetAmount != null ? { budgetAmount: parseFloat(budgetAmount) } : {}),
      ...(savedAmount != null ? { savedAmount: parseFloat(savedAmount) } : {}),
      ...(fundId !== undefined ? { fundId: fundId || null } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
    },
  });

  res.json(enrichPlannedEvent(event));
});

/**
 * POST /api/planned-events/:id/reserve
 *
 * Aparta dinero para el evento. Esto es una TRANSFERENCIA, no un gasto: sube
 * `savedAmount` y, si el evento está ligado a un fondo, sube también el saldo
 * del fondo dejando un movimiento trazable. No crea ninguna Transaction.
 */
router.post('/:id/reserve', async (req: AuthRequest, res: Response): Promise<void> => {
  const event = await prisma.plannedEvent.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!event) {
    res.status(404).json({ error: 'Evento no encontrado' });
    return;
  }

  const amount = parseFloat(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount debe ser un número mayor que cero' });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.plannedEvent.update({
      where: { id: event.id },
      data: { savedAmount: round2(event.savedAmount + amount) },
    });

    if (event.fundId) {
      const fund = await tx.fund.findUnique({ where: { id: event.fundId } });
      if (fund) {
        await tx.fund.update({
          where: { id: fund.id },
          data: { balance: round2(fund.balance + amount) },
        });
        await tx.fundMovement.create({
          data: {
            fundId: fund.id,
            amount,
            type: 'DEPOSIT',
            note: `Provisión para ${event.name}`,
            plannedEventId: event.id,
          },
        });
      }
    }

    return result;
  });

  writeLog({
    type: 'TRANSACTION',
    level: 'INFO',
    userId: req.userId,
    message: `Provisión reservada: ${event.name} +${amount}`,
    meta: { plannedEventId: event.id, amount },
  }).catch(() => {});

  res.json(enrichPlannedEvent(updated));
});

/**
 * POST /api/planned-events/:id/settle
 *
 * Registra el pago real del evento. Crea la Transaction (gasto, tipo PLANNED) y
 * consume el dinero ya reservado, de modo que el gasto no vuelve a restarse del
 * dinero disponible del mes: ese dinero se apartó en meses anteriores.
 */
router.post('/:id/settle', async (req: AuthRequest, res: Response): Promise<void> => {
  const event = await prisma.plannedEvent.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!event) {
    res.status(404).json({ error: 'Evento no encontrado' });
    return;
  }

  const amount = parseFloat(req.body.amount ?? event.budgetAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount debe ser un número mayor que cero' });
    return;
  }

  const merchant = req.body.merchant?.trim() || event.name;
  const date = req.body.date ? new Date(req.body.date) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId: req.userId!,
        amount,
        merchant,
        category: req.body.category?.trim() || 'Otros',
        rawText: `Evento previsible: ${event.name}`,
        date,
        expenseType: 'PLANNED',
        plannedEventId: event.id,
      },
    });

    // Se consume lo reservado hasta donde alcance; el resto sale del mes en curso.
    const consumedFromReserve = Math.min(event.savedAmount, amount);
    const uncovered = round2(amount - consumedFromReserve);

    if (event.fundId && consumedFromReserve > 0) {
      const fund = await tx.fund.findUnique({ where: { id: event.fundId } });
      if (fund) {
        await tx.fund.update({
          where: { id: fund.id },
          data: { balance: round2(fund.balance - consumedFromReserve) },
        });
        await tx.fundMovement.create({
          data: {
            fundId: fund.id,
            amount: consumedFromReserve,
            type: 'WITHDRAWAL',
            note: `Pago de ${event.name}`,
            plannedEventId: event.id,
            date,
          },
        });
      }
    }

    // Solo se descuenta lo realmente consumido: si sobró dinero reservado, sigue
    // etiquetado para este evento (el año que viene hará falta ahorrar menos).
    // Un evento que no se repite se archiva, porque ya ocurrió.
    const updatedEvent = await tx.plannedEvent.update({
      where: { id: event.id },
      data: {
        savedAmount: round2(event.savedAmount - consumedFromReserve),
        ...(event.yearlyRecurring ? {} : { active: false }),
      },
    });

    return { transaction, updatedEvent, consumedFromReserve, uncovered };
  });

  writeLog({
    type: 'TRANSACTION',
    level: 'INFO',
    userId: req.userId,
    message: `Evento pagado: ${event.name} ${amount}`,
    meta: {
      plannedEventId: event.id,
      amount,
      consumedFromReserve: result.consumedFromReserve,
      uncovered: result.uncovered,
    },
  }).catch(() => {});

  res.status(201).json({
    transaction: result.transaction,
    event: enrichPlannedEvent(result.updatedEvent),
    consumedFromReserve: result.consumedFromReserve,
    /** Parte del pago que NO estaba reservada y sale del presupuesto del mes. */
    uncovered: result.uncovered,
  });
});

// DELETE /api/planned-events/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.plannedEvent.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Evento no encontrado' });
    return;
  }

  await prisma.plannedEvent.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
