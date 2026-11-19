import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { writeLog } from '../services/logger';

const router = Router();

router.use(authenticate);

const TYPES = [
  'BIRTHDAYS',
  'CHRISTMAS',
  'VACATION',
  'ANNUAL',
  'EMERGENCY',
  'GOAL',
  'INVESTMENT',
];

/** Fondos cuyo dinero ya está contado en las provisiones de eventos. */
const EVENT_BACKED = ['BIRTHDAYS', 'CHRISTMAS', 'VACATION', 'ANNUAL'];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Aportación mensual sugerida para llegar al objetivo en la fecha límite. */
function suggestedMonthlyContribution(
  targetAmount: number | null,
  balance: number,
  targetDate: Date | null
): number | null {
  if (targetAmount == null || targetDate == null) return null;

  const now = new Date();
  const months = Math.max(
    1,
    (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()) + 1
  );
  return round2(Math.max(0, targetAmount - balance) / months);
}

// GET /api/funds
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const funds = await prisma.fund.findMany({
    where: { userId: req.userId },
    include: {
      events: { where: { active: true }, select: { id: true, name: true, savedAmount: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const enriched = funds.map((fund) => {
    // Dinero del fondo ya etiquetado para eventos concretos. El resto es libre
    // dentro del fondo, pero sigue siendo dinero reservado, no disponible.
    const allocatedToEvents = round2(
      fund.events.reduce((sum, e) => sum + e.savedAmount, 0)
    );

    return {
      id: fund.id,
      name: fund.name,
      type: fund.type,
      targetAmount: fund.targetAmount,
      balance: fund.balance,
      targetDate: fund.targetDate?.toISOString() ?? null,
      monthlyContribution: fund.monthlyContribution,
      suggestedMonthlyContribution: suggestedMonthlyContribution(
        fund.targetAmount,
        fund.balance,
        fund.targetDate
      ),
      progress:
        fund.targetAmount && fund.targetAmount > 0
          ? Math.min(100, round2((fund.balance / fund.targetAmount) * 100))
          : null,
      allocatedToEvents,
      unallocated: round2(fund.balance - allocatedToEvents),
      overAllocated: allocatedToEvents > fund.balance + 0.01,
      /** Su aportación no se suma al presupuesto: ya está en las provisiones. */
      fundedByEventProvisions: EVENT_BACKED.includes(fund.type),
      events: fund.events,
    };
  });

  res.json({
    funds: enriched,
    totalBalance: round2(enriched.reduce((s, f) => s + f.balance, 0)),
  });
});

// POST /api/funds
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, type, targetAmount, balance, targetDate, monthlyContribution } = req.body;

  if (!name?.trim()) {
    res.status(400).json({ error: 'name es requerido' });
    return;
  }
  if (type && !TYPES.includes(type)) {
    res.status(400).json({ error: `type debe ser uno de: ${TYPES.join(', ')}` });
    return;
  }

  const fund = await prisma.fund.create({
    data: {
      userId: req.userId!,
      name: name.trim(),
      type: type ?? 'GOAL',
      targetAmount: targetAmount != null ? parseFloat(targetAmount) : null,
      balance: balance != null ? parseFloat(balance) : 0,
      targetDate: targetDate ? new Date(targetDate) : null,
      monthlyContribution: monthlyContribution != null ? parseFloat(monthlyContribution) : null,
    },
  });

  res.status(201).json(fund);
});

// PATCH /api/funds/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.fund.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Fondo no encontrado' });
    return;
  }

  const { name, type, targetAmount, targetDate, monthlyContribution } = req.body;

  const fund = await prisma.fund.update({
    where: { id: req.params.id },
    data: {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(type && TYPES.includes(type) ? { type } : {}),
      ...(targetAmount !== undefined
        ? { targetAmount: targetAmount != null ? parseFloat(targetAmount) : null }
        : {}),
      ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
      ...(monthlyContribution !== undefined
        ? {
            monthlyContribution:
              monthlyContribution != null ? parseFloat(monthlyContribution) : null,
          }
        : {}),
    },
  });

  res.json(fund);
});

/**
 * POST /api/funds/:id/movements
 *
 * Aporta o retira dinero del fondo. Es una transferencia entre "dinero
 * disponible" y "dinero reservado": nunca crea una Transaction, porque mover
 * dinero a un fondo no es gastarlo.
 */
router.post('/:id/movements', async (req: AuthRequest, res: Response): Promise<void> => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!fund) {
    res.status(404).json({ error: 'Fondo no encontrado' });
    return;
  }

  const amount = parseFloat(req.body.amount);
  const type = req.body.type;

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount debe ser un número mayor que cero' });
    return;
  }
  if (!['DEPOSIT', 'WITHDRAWAL'].includes(type)) {
    res.status(400).json({ error: 'type debe ser "DEPOSIT" o "WITHDRAWAL"' });
    return;
  }
  if (type === 'WITHDRAWAL' && amount > fund.balance + 0.01) {
    res.status(400).json({
      error: `No puedes retirar ${amount} de "${fund.name}": el saldo es ${fund.balance}`,
    });
    return;
  }

  const delta = type === 'DEPOSIT' ? amount : -amount;

  const result = await prisma.$transaction(async (tx) => {
    const movement = await tx.fundMovement.create({
      data: {
        fundId: fund.id,
        amount,
        type,
        note: req.body.note?.trim() || null,
        date: req.body.date ? new Date(req.body.date) : new Date(),
      },
    });
    const updated = await tx.fund.update({
      where: { id: fund.id },
      data: { balance: round2(fund.balance + delta) },
    });
    return { movement, updated };
  });

  writeLog({
    type: 'TRANSACTION',
    level: 'INFO',
    userId: req.userId,
    message: `Fondo "${fund.name}": ${type === 'DEPOSIT' ? '+' : '-'}${amount}`,
    meta: { fundId: fund.id, amount, type },
  }).catch(() => {});

  res.status(201).json({ movement: result.movement, fund: result.updated });
});

// GET /api/funds/:id/movements
router.get('/:id/movements', async (req: AuthRequest, res: Response): Promise<void> => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!fund) {
    res.status(404).json({ error: 'Fondo no encontrado' });
    return;
  }

  const movements = await prisma.fundMovement.findMany({
    where: { fundId: fund.id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  res.json(movements);
});

// DELETE /api/funds/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { events: true },
  });
  if (!fund) {
    res.status(404).json({ error: 'Fondo no encontrado' });
    return;
  }
  if (fund.events.length > 0) {
    res.status(409).json({
      error: `"${fund.name}" tiene ${fund.events.length} evento(s) ligados. Desvincúlalos antes de borrarlo.`,
    });
    return;
  }

  await prisma.fund.delete({ where: { id: fund.id } });
  res.status(204).send();
});

export default router;
