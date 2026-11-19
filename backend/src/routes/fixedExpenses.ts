import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /api/fixed-expenses
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const expenses = await prisma.fixedExpense.findMany({
    where: { userId: req.userId },
    orderBy: [{ active: 'desc' }, { amount: 'desc' }],
  });

  const total = expenses
    .filter((e) => e.active)
    .reduce((sum, e) => sum + e.amount, 0);

  // Se distingue el gasto de importe fijo del necesario pero variable (luz,
  // agua, supermercado), porque el segundo solo es una estimación.
  const fixedAmount = expenses
    .filter((e) => e.active && !e.isVariableAmount)
    .reduce((sum, e) => sum + e.amount, 0);

  res.json({
    expenses,
    total: Math.round(total * 100) / 100,
    fixedAmountTotal: Math.round(fixedAmount * 100) / 100,
    estimatedAmountTotal: Math.round((total - fixedAmount) * 100) / 100,
  });
});

// POST /api/fixed-expenses
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, category, amount, isVariableAmount, dayOfMonth } = req.body;

  if (!name?.trim() || amount == null) {
    res.status(400).json({ error: 'name y amount son requeridos' });
    return;
  }

  const expense = await prisma.fixedExpense.create({
    data: {
      userId: req.userId!,
      name: name.trim(),
      category: category?.trim() || 'Servicios',
      amount: parseFloat(amount),
      isVariableAmount: Boolean(isVariableAmount),
      dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth) : null,
    },
  });

  res.status(201).json(expense);
});

// PATCH /api/fixed-expenses/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.fixedExpense.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Gasto fijo no encontrado' });
    return;
  }

  const { name, category, amount, isVariableAmount, dayOfMonth, active } = req.body;

  const expense = await prisma.fixedExpense.update({
    where: { id: req.params.id },
    data: {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(category?.trim() ? { category: category.trim() } : {}),
      ...(amount != null ? { amount: parseFloat(amount) } : {}),
      ...(isVariableAmount !== undefined ? { isVariableAmount: Boolean(isVariableAmount) } : {}),
      ...(dayOfMonth !== undefined
        ? { dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth) : null }
        : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
    },
  });

  res.json(expense);
});

// DELETE /api/fixed-expenses/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.fixedExpense.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Gasto fijo no encontrado' });
    return;
  }

  await prisma.fixedExpense.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
