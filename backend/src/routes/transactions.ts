import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
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
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
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
    Comida: '#fb7185', Transporte: '#60a5fa', Entretenimiento: '#a78bfa',
    Salud: '#4ade80', Supermercado: '#facc15', Compras: '#f472b6',
    Servicios: '#38bdf8', Educación: '#fb923c', Viajes: '#2dd4bf', Otros: '#94a3b8',
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

// GET /api/transactions/export?month=4&year=2026
router.get('/export', async (req: AuthRequest, res: Response): Promise<void> => {
  const now = new Date();
  const y = parseInt((req.query.year as string) || now.getFullYear().toString());
  const m = parseInt((req.query.month as string) || (now.getMonth() + 1).toString());

  const start = new Date(y, m - 1, 1);
  const end   = new Date(y, m, 1);

  const txs = await prisma.transaction.findMany({
    where: { userId: req.userId, date: { gte: start, lt: end } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  const MONTH_NAMES: Record<number, string> = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Finanzas App';
  const sheet = workbook.addWorksheet('Estado de cuenta');

  sheet.columns = [
    { key: 'date',     width: 14 },
    { key: 'merchant', width: 32 },
    { key: 'category', width: 20 },
    { key: 'card',     width: 14 },
    { key: 'amount',   width: 14 },
  ];

  // Title
  sheet.mergeCells('A1:E1');
  const title = sheet.getCell('A1');
  title.value = `Estado de cuenta — ${MONTH_NAMES[m]} ${y}`;
  title.font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  // Header
  const headerRow = sheet.addRow(['Fecha', 'Establecimiento', 'Categoría', 'Tarjeta', 'Monto']);
  headerRow.eachCell((cell) => {
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 22;

  // Data
  for (const tx of txs) {
    const row = sheet.addRow([
      new Date(tx.date).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      tx.merchant,
      tx.category,
      tx.cardLast4 ? `****${tx.cardLast4}` : '—',
      tx.amount,
    ]);
    row.getCell(5).numFmt = '"$"#,##0.00';
    row.getCell(5).alignment = { horizontal: 'right' };
  }

  // Total row
  const total = txs.reduce((s, t) => s + t.amount, 0);
  const totalRow = sheet.addRow(['', '', '', 'TOTAL', total]);
  totalRow.font = { bold: true };
  totalRow.getCell(4).alignment = { horizontal: 'right' };
  totalRow.getCell(5).numFmt = '"$"#,##0.00';
  totalRow.getCell(5).alignment = { horizontal: 'right' };
  totalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  const filename = `estado-cuenta-${(MONTH_NAMES[m] ?? m).toString().toLowerCase()}-${y}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

// PATCH /api/transactions/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });

  if (!tx) {
    res.status(404).json({ error: 'Transacción no encontrada' });
    return;
  }

  const { amount, merchant, cardLast4, category, date } = req.body;

  const updated = await prisma.transaction.update({
    where: { id: req.params.id },
    data: {
      ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
      ...(merchant !== undefined ? { merchant } : {}),
      ...(cardLast4 !== undefined ? { cardLast4: cardLast4 || null } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(date !== undefined ? { date: new Date(date) } : {}),
    },
  });

  writeLog({
    type: 'TRANSACTION',
    level: 'INFO',
    userId: req.userId,
    message: `Transacción editada: ${updated.merchant} $${updated.amount}`,
    meta: { transactionId: updated.id },
  }).catch(() => {});

  res.json(updated);
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
