import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { computeMonthlyBudget } from '../services/budget';

const router = Router();

router.use(authenticate);

/**
 * GET /api/budget/monthly?year=2026&month=11
 *
 * Presupuesto mensual completo: ingresos netos, gastos fijos, presupuesto
 * variable, provisión para gastos anuales, fondo de emergencia, ahorro e
 * inversión, y el dinero disponible después de todas las asignaciones.
 */
router.get('/monthly', async (req: AuthRequest, res: Response): Promise<void> => {
  const now = new Date();
  const year = parseInt((req.query.year as string) ?? String(now.getFullYear()));
  const month = parseInt((req.query.month as string) ?? String(now.getMonth() + 1));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'year y month deben ser números válidos (month 1-12)' });
    return;
  }

  const budget = await computeMonthlyBudget(req.userId!, year, month);
  res.json(budget);
});

export default router;
