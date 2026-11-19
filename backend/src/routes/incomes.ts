import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

const TYPES = ['SALARY', 'SECONDARY', 'EXTRAORDINARY', 'OTHER'];
const FREQUENCIES = ['MONTHLY', 'ONE_TIME'];

// GET /api/incomes
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const incomes = await prisma.income.findMany({
    where: { userId: req.userId },
    orderBy: [{ active: 'desc' }, { amount: 'desc' }],
  });

  // Importe que el presupuesto usa realmente: para un ingreso variable es la
  // estimación conservadora, nunca el mejor caso.
  const enriched = incomes.map((i) => ({
    ...i,
    planningAmount: i.isVariable ? i.conservativeAmount ?? i.amount : i.amount,
  }));

  res.json(enriched);
});

// POST /api/incomes
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, type, amount, isVariable, conservativeAmount, frequency, dayOfMonth, receivedOn } =
    req.body;

  if (!name?.trim() || amount == null) {
    res.status(400).json({ error: 'name y amount son requeridos' });
    return;
  }
  if (type && !TYPES.includes(type)) {
    res.status(400).json({ error: `type debe ser uno de: ${TYPES.join(', ')}` });
    return;
  }
  if (frequency && !FREQUENCIES.includes(frequency)) {
    res.status(400).json({ error: `frequency debe ser uno de: ${FREQUENCIES.join(', ')}` });
    return;
  }
  if (frequency === 'ONE_TIME' && !receivedOn) {
    res.status(400).json({ error: 'receivedOn es requerido para un ingreso puntual' });
    return;
  }

  const income = await prisma.income.create({
    data: {
      userId: req.userId!,
      name: name.trim(),
      type: type ?? 'SALARY',
      amount: parseFloat(amount),
      isVariable: Boolean(isVariable),
      conservativeAmount: conservativeAmount != null ? parseFloat(conservativeAmount) : null,
      frequency: frequency ?? 'MONTHLY',
      dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth) : null,
      receivedOn: receivedOn ? new Date(receivedOn) : null,
    },
  });

  res.status(201).json(income);
});

// PATCH /api/incomes/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.income.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Ingreso no encontrado' });
    return;
  }

  const { name, type, amount, isVariable, conservativeAmount, frequency, dayOfMonth, receivedOn, active } =
    req.body;

  const income = await prisma.income.update({
    where: { id: req.params.id },
    data: {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(type && TYPES.includes(type) ? { type } : {}),
      ...(amount != null ? { amount: parseFloat(amount) } : {}),
      ...(isVariable !== undefined ? { isVariable: Boolean(isVariable) } : {}),
      ...(conservativeAmount !== undefined
        ? { conservativeAmount: conservativeAmount != null ? parseFloat(conservativeAmount) : null }
        : {}),
      ...(frequency && FREQUENCIES.includes(frequency) ? { frequency } : {}),
      ...(dayOfMonth !== undefined
        ? { dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth) : null }
        : {}),
      ...(receivedOn !== undefined ? { receivedOn: receivedOn ? new Date(receivedOn) : null } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
    },
  });

  res.json(income);
});

// DELETE /api/incomes/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.income.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Ingreso no encontrado' });
    return;
  }

  await prisma.income.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
