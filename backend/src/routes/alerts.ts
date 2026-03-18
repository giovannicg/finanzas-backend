import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/alerts
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const alerts = await prisma.alert.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });

  // Attach current spending to each alert
  const now = new Date();
  const enriched = await Promise.all(
    alerts.map(async (alert) => {
      const periodStart = alert.period === 'weekly'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
        : new Date(now.getFullYear(), now.getMonth(), 1);

      const { _sum } = await prisma.transaction.aggregate({
        where: { userId: req.userId!, category: alert.category, date: { gte: periodStart } },
        _sum: { amount: true },
      });

      const currentSpend = _sum.amount ?? 0;
      return {
        ...alert,
        currentSpend,
        percentage: (currentSpend / alert.limitAmount) * 100,
      };
    })
  );

  res.json(enriched);
});

// POST /api/alerts
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { category, limitAmount, period } = req.body;

  if (!category || !limitAmount || !period) {
    res.status(400).json({ error: 'category, limitAmount y period son requeridos' });
    return;
  }

  if (!['monthly', 'weekly'].includes(period)) {
    res.status(400).json({ error: 'period debe ser "monthly" o "weekly"' });
    return;
  }

  // Upsert: one alert per user+category+period
  const existing = await prisma.alert.findFirst({
    where: { userId: req.userId, category, period },
  });

  let alert;
  if (existing) {
    alert = await prisma.alert.update({
      where: { id: existing.id },
      data: { limitAmount: parseFloat(limitAmount), active: true },
    });
  } else {
    alert = await prisma.alert.create({
      data: {
        userId: req.userId!,
        category,
        limitAmount: parseFloat(limitAmount),
        period,
      },
    });
  }

  res.status(201).json(alert);
});

// PATCH /api/alerts/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.alert.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Alerta no encontrada' });
    return;
  }

  const { limitAmount, active } = req.body;
  const alert = await prisma.alert.update({
    where: { id: req.params.id },
    data: {
      ...(limitAmount !== undefined ? { limitAmount: parseFloat(limitAmount) } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });

  res.json(alert);
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.alert.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Alerta no encontrada' });
    return;
  }

  await prisma.alert.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
