import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkAlerts } from '../services/alertChecker';
import { writeLog } from '../services/logger';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/transactions
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { category, from, to, page = '1', limit = '20' } = req.query;

  const where: Record<string, unknown> = { userId: req.userId };

  if (category) where.category = category;

  if (from || to) {
    where.date = {
      ...(from ? { gte: new Date(from as string) } : {}),
      ...(to ? { lte: new Date(to as string) } : {}),
    };
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({ transactions, total, page: parseInt(page as string) });
});

// POST /api/transactions
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount, merchant, cardLast4, category, date } = req.body;

  if (!amount || !merchant || !category) {
    res.status(400).json({ error: 'amount, merchant y category son requeridos' });
    return;
  }

  const tx = await prisma.transaction.create({
    data: {
      userId: req.userId!,
      amount: parseFloat(amount),
      merchant,
      cardLast4: cardLast4 || null,
      category,
      rawText: `Manual: ${merchant}`,
      date: date ? new Date(date) : new Date(),
    },
  });

  // Check budget alerts (fire-and-forget, no bloquear la respuesta)
  checkAlerts(req.userId!, category).catch((e) =>
    console.error('[alerts] Error chequeando alertas:', e)
  );

  writeLog({
    type: 'TRANSACTION',
    level: 'INFO',
    userId: req.userId,
    message: `Transacción creada: ${merchant} $${amount}`,
    meta: { transactionId: tx.id, merchant, amount, category },
  }).catch(() => {});

  res.status(201).json(tx);
});

// GET /api/transactions/summary
router.get('/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  const { year, month } = req.query;

  const now = new Date();
  const y = parseInt((year as string) ?? now.getFullYear().toString());
  const m = parseInt((month as string) ?? (now.getMonth() + 1).toString());

  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);

  // Category breakdown for the selected month
  const rows = await prisma.transaction.groupBy({
    by: ['category'],
    where: { userId: req.userId, date: { gte: start, lt: end } },
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { _sum: { amount: 'desc' } },
  });

  const totalSpent = rows.reduce((acc, r) => acc + (r._sum.amount ?? 0), 0);
  const transactionCount = rows.reduce((acc, r) => acc + r._count.id, 0);
  const topCategory = rows[0]?.category ?? null;

  // Colors from custom categories
  const customCats = await prisma.category.findMany({ where: { userId: req.userId } });
  const colorMap = new Map(customCats.map((c) => [c.name, c.color]));

  const DEFAULT_COLORS: Record<string, string> = {
    Comida: '#f97316', Transporte: '#3b82f6', Entretenimiento: '#a855f7',
    Salud: '#22c55e', Supermercado: '#eab308', Ropa: '#ec4899',
    Servicios: '#06b6d4', Educación: '#f43f5e', Viajes: '#14b8a6', Otros: '#64748b',
  };

  const byCategory = rows.map((r) => ({
    category: r.category,
    color: colorMap.get(r.category) ?? DEFAULT_COLORS[r.category] ?? '#64748b',
    total: r._sum.amount ?? 0,
  }));

  // Alerts triggered (>=80% of limit)
  const alerts = await prisma.alert.findMany({ where: { userId: req.userId, active: true } });
  let alertsTriggered = 0;
  for (const alert of alerts) {
    const row = rows.find((r) => r.category === alert.category);
    const spent = row?._sum.amount ?? 0;
    if (alert.limitAmount > 0 && spent / alert.limitAmount >= 0.8) alertsTriggered++;
  }

  // 6-month spending trend
  const monthly: { month: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const agg = await prisma.transaction.aggregate({
      where: { userId: req.userId, date: { gte: mStart, lt: mEnd } },
      _sum: { amount: true },
    });
    monthly.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      total: agg._sum.amount ?? 0,
    });
  }

  res.json({ totalSpent, transactionCount, topCategory, alertsTriggered, byCategory, monthly });
});

// GET /api/transactions/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });

  if (!tx) {
    res.status(404).json({ error: 'Transacción no encontrada' });
    return;
  }

  res.json(tx);
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });

  if (!tx) {
    res.status(404).json({ error: 'Transacción no encontrada' });
    return;
  }

  await prisma.transaction.delete({ where: { id: req.params.id } });

  writeLog({
    type: 'TRANSACTION',
    level: 'WARN',
    userId: req.userId,
    message: `Transacción eliminada: ${tx.merchant} $${tx.amount}`,
    meta: { transactionId: tx.id, merchant: tx.merchant, amount: tx.amount },
  }).catch(() => {});

  res.status(204).send();
});

export default router;
