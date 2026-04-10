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

  const rows = await prisma.transaction.groupBy({
    by: ['category'],
    where: { userId: req.userId, date: { gte: start, lt: end } },
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { _sum: { amount: 'desc' } },
  });

  const totalMonth = rows.reduce((acc, r) => acc + (r._sum.amount ?? 0), 0);

  const summary = rows.map((r) => ({
    category: r.category,
    total: r._sum.amount ?? 0,
    count: r._count.id,
    percentage: totalMonth > 0 ? ((r._sum.amount ?? 0) / totalMonth) * 100 : 0,
  }));

  res.json({ summary, totalMonth, year: y, month: m });
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
