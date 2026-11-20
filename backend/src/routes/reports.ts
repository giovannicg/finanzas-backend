import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { computeReport, DEFAULT_SMALL_EXPENSE_THRESHOLD, type ReportPeriodType } from '../services/reports';
import { computeAnnualCalendar } from '../services/calendar';

const router = Router();

router.use(authenticate);

/**
 * GET /api/reports?period=week|month&date=2026-11-18&smallThreshold=10
 *
 * Informe semanal o mensual: total gastado, distribución por categoría,
 * presupuesto vs. real, categorías excedidas, gastos pequeños acumulados,
 * patrones de consumo, evolución del ahorro, próximos pagos y recomendaciones.
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const period = (req.query.period as string) ?? 'month';

  if (period !== 'week' && period !== 'month') {
    res.status(400).json({ error: 'period debe ser "week" o "month"' });
    return;
  }

  // `date` es cualquier día dentro del periodo que se quiere analizar.
  let reference = new Date();
  if (req.query.date) {
    const parsed = new Date(req.query.date as string);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: 'date no es una fecha válida' });
      return;
    }
    reference = parsed;
  }

  let smallThreshold = DEFAULT_SMALL_EXPENSE_THRESHOLD;
  if (req.query.smallThreshold !== undefined) {
    const parsed = parseFloat(req.query.smallThreshold as string);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'smallThreshold debe ser un número mayor que cero' });
      return;
    }
    smallThreshold = parsed;
  }

  const report = await computeReport(
    req.userId!,
    period as ReportPeriodType,
    reference,
    smallThreshold
  );

  res.json(report);
});

/**
 * GET /api/reports/calendar?year=2026&month=11
 *
 * Calendario financiero de 12 meses a partir del mes indicado, con el coste
 * anual de los eventos previsibles y cuánto hay que reservar cada mes.
 */
router.get('/calendar', async (req: AuthRequest, res: Response): Promise<void> => {
  const now = new Date();
  const year = parseInt((req.query.year as string) ?? String(now.getFullYear()));
  const month = parseInt((req.query.month as string) ?? String(now.getMonth() + 1));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'year y month deben ser números válidos (month 1-12)' });
    return;
  }

  const calendar = await computeAnnualCalendar(req.userId!, year, month);
  res.json(calendar);
});

export default router;
