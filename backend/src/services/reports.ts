import { prisma } from '../lib/prisma';
import { computeMonthlyBudget, enrichPlannedEvent, EXPENSE_TYPES, type ExpenseType } from './budget';
import { buildRecommendations } from './recommendations';

/**
 * Análisis financiero semanal y mensual (sección 6 del plan).
 *
 * El informe nunca inventa importes: todo sale de las transacciones, los
 * límites por categoría y los movimientos de fondos ya registrados. Cuando no
 * hay datos suficientes para una conclusión, se dice en lugar de rellenar.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Importe por debajo del cual un gasto se considera "pequeño". */
export const DEFAULT_SMALL_EXPENSE_THRESHOLD = 10;

/** Veces que debe repetirse un comercio para considerarlo un patrón. */
const PATTERN_MIN_OCCURRENCES = 3;

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  Comida: '#fb7185', Transporte: '#60a5fa', Entretenimiento: '#a78bfa',
  Salud: '#4ade80', Supermercado: '#facc15', Compras: '#f472b6',
  Servicios: '#38bdf8', Educación: '#fb923c', Viajes: '#2dd4bf', Otros: '#94a3b8',
};

export type ReportPeriodType = 'week' | 'month';

/** Semana de lunes a domingo, que es como se percibe la semana en español. */
function weekRange(reference: Date): { start: Date; end: Date } {
  const day = reference.getDay(); // 0 = domingo
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - daysSinceMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

function monthRange(reference: Date): { start: Date; end: Date } {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  return { start, end };
}

/** Periodo inmediatamente anterior, de la misma longitud, para comparar. */
function previousRange(type: ReportPeriodType, start: Date): { start: Date; end: Date } {
  if (type === 'week') {
    const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    return { start: prevStart, end: start };
  }
  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  return { start: prevStart, end: start };
}

export interface CategorySpend {
  category: string;
  color: string;
  total: number;
  count: number;
  /** Porcentaje del gasto total del periodo. */
  share: number;
}

export interface BudgetBreach {
  category: string;
  limitAmount: number;
  spent: number;
  overBy: number;
  percentage: number;
  period: string;
}

export interface SmallExpenseAnalysis {
  threshold: number;
  count: number;
  total: number;
  /** Porcentaje del gasto total que suman los gastos pequeños. */
  shareOfTotal: number;
  averageAmount: number;
  /** Lo que supondrían al año a este ritmo. Proyección, no un dato real. */
  projectedYearly: number;
  topMerchants: { merchant: string; count: number; total: number }[];
}

export interface SpendingPattern {
  merchant: string;
  category: string;
  count: number;
  total: number;
  averageAmount: number;
}

export interface UpcomingPayment {
  kind: 'FIXED' | 'EVENT';
  name: string;
  amount: number;
  date: string | null;
  dayOfMonth: number | null;
  /** Solo para eventos: lo que falta por reservar. */
  remaining?: number;
}

export interface BudgetComparisonSummary {
  income: number;
  allocated: number;
  available: number;
  fixedBudgeted: number;
  fixedActual: number;
  variableBudgeted: number;
  variableActual: number;
}

export interface SavingsSummary {
  /** Aportación neta a fondos en el periodo (aportaciones menos retiradas). */
  netFundFlow: number;
  /** Saldo total actual de todos los fondos. */
  currentFundBalance: number;
  /** Dinero etiquetado para eventos previsibles. */
  reservedForEvents: number;
  /** Flujo neto a fondos de los últimos 6 meses. */
  monthlyFlow: { month: string; net: number }[];
}

export interface FinancialReport {
  period: {
    type: ReportPeriodType;
    start: string;
    end: string;
    label: string;
  };
  currency: string;
  totals: {
    spent: number;
    transactionCount: number;
    previousSpent: number;
    /** Variación frente al periodo anterior, en porcentaje. */
    changePercent: number | null;
  };
  byCategory: CategorySpend[];
  byExpenseType: Record<ExpenseType, number>;
  /** Solo en informes mensuales: el presupuesto completo del mes. */
  budgetComparison: BudgetComparisonSummary | null;
  breaches: BudgetBreach[];
  smallExpenses: SmallExpenseAnalysis;
  patterns: SpendingPattern[];
  savings: SavingsSummary;
  upcomingPayments: UpcomingPayment[];
  recommendations: { priority: 'HIGH' | 'MEDIUM' | 'LOW'; title: string; detail: string }[];
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatLabel(type: ReportPeriodType, start: Date, end: Date): string {
  if (type === 'month') {
    return `${MONTH_NAMES[start.getMonth()]} de ${start.getFullYear()}`;
  }
  const last = new Date(end.getTime() - 86400000);
  const sameMonth = start.getMonth() === last.getMonth();
  return sameMonth
    ? `${start.getDate()}–${last.getDate()} de ${MONTH_NAMES[start.getMonth()]}`
    : `${start.getDate()} de ${MONTH_NAMES[start.getMonth()]} – ${last.getDate()} de ${MONTH_NAMES[last.getMonth()]}`;
}

export async function computeReport(
  userId: string,
  type: ReportPeriodType,
  reference: Date,
  smallThreshold: number = DEFAULT_SMALL_EXPENSE_THRESHOLD
): Promise<FinancialReport> {
  const { start, end } = type === 'week' ? weekRange(reference) : monthRange(reference);
  const prev = previousRange(type, start);

  const sixMonthsAgo = new Date(start.getFullYear(), start.getMonth() - 5, 1);

  const [user, txs, prevAgg, alerts, customCats, events, funds, fixedExpenses, fundMovements] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: start, lt: end } },
        orderBy: { date: 'desc' },
      }),
      prisma.transaction.aggregate({
        where: { userId, date: { gte: prev.start, lt: prev.end } },
        _sum: { amount: true },
      }),
      prisma.alert.findMany({ where: { userId, active: true } }),
      prisma.category.findMany({ where: { userId } }),
      prisma.plannedEvent.findMany({ where: { userId, active: true } }),
      prisma.fund.findMany({ where: { userId } }),
      prisma.fixedExpense.findMany({ where: { userId, active: true } }),
      prisma.fundMovement.findMany({
        where: { fund: { userId }, date: { gte: sixMonthsAgo, lt: end } },
      }),
    ]);

  const colorMap = new Map(customCats.map((c) => [c.name, c.color]));

  // ── Totales ────────────────────────────────────────────────────────────────
  const totalSpent = round2(txs.reduce((s, t) => s + t.amount, 0));
  const previousSpent = round2(prevAgg._sum.amount ?? 0);
  const changePercent =
    previousSpent > 0 ? round2(((totalSpent - previousSpent) / previousSpent) * 100) : null;

  // ── Distribución por categoría ─────────────────────────────────────────────
  const categoryMap = new Map<string, { total: number; count: number }>();
  for (const tx of txs) {
    const entry = categoryMap.get(tx.category) ?? { total: 0, count: 0 };
    entry.total += tx.amount;
    entry.count += 1;
    categoryMap.set(tx.category, entry);
  }

  const byCategory: CategorySpend[] = [...categoryMap.entries()]
    .map(([category, { total, count }]) => ({
      category,
      color: colorMap.get(category) ?? DEFAULT_CATEGORY_COLORS[category] ?? '#64748b',
      total: round2(total),
      count,
      share: totalSpent > 0 ? round2((total / totalSpent) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Distribución por tipo de gasto ─────────────────────────────────────────
  const byExpenseType = EXPENSE_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<ExpenseType, number>
  );
  for (const tx of txs) {
    const key = (EXPENSE_TYPES as readonly string[]).includes(tx.expenseType)
      ? (tx.expenseType as ExpenseType)
      : 'VARIABLE';
    byExpenseType[key] = round2(byExpenseType[key] + tx.amount);
  }

  // ── Presupuesto vs. real (solo tiene sentido en informe mensual) ───────────
  let budgetComparison: BudgetComparisonSummary | null = null;
  if (type === 'month') {
    const budget = await computeMonthlyBudget(userId, start.getFullYear(), start.getMonth() + 1);
    budgetComparison = {
      income: budget.income.total,
      allocated: budget.allocations.total,
      available: budget.available,
      fixedBudgeted: budget.comparison.fixed.budgeted,
      fixedActual: budget.comparison.fixed.actual,
      variableBudgeted: budget.comparison.variable.budgeted,
      variableActual: budget.comparison.variable.actual,
    };
  }

  // ── Categorías donde se gastó más de lo previsto ───────────────────────────
  // Un límite semanal se compara contra el gasto semanal; uno mensual se
  // prorratea según los días del periodo del informe.
  const periodDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  const breaches: BudgetBreach[] = [];
  for (const alert of alerts) {
    const spent = round2(categoryMap.get(alert.category)?.total ?? 0);
    const limitForPeriod =
      alert.period === 'weekly'
        ? round2(alert.limitAmount * (periodDays / 7))
        : round2(alert.limitAmount * (periodDays / 30));

    if (limitForPeriod > 0 && spent > limitForPeriod) {
      breaches.push({
        category: alert.category,
        limitAmount: limitForPeriod,
        spent,
        overBy: round2(spent - limitForPeriod),
        percentage: round2((spent / limitForPeriod) * 100),
        period: alert.period,
      });
    }
  }
  breaches.sort((a, b) => b.overBy - a.overBy);

  // ── Gastos pequeños acumulados ─────────────────────────────────────────────
  const small = txs.filter((t) => t.amount <= smallThreshold);
  const smallTotal = round2(small.reduce((s, t) => s + t.amount, 0));

  const smallByMerchant = new Map<string, { count: number; total: number }>();
  for (const tx of small) {
    const entry = smallByMerchant.get(tx.merchant) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += tx.amount;
    smallByMerchant.set(tx.merchant, entry);
  }

  // Proyección anual al ritmo del periodo. Es una estimación, no un dato.
  const periodsPerYear = type === 'week' ? 52 : 12;

  const smallExpenses: SmallExpenseAnalysis = {
    threshold: smallThreshold,
    count: small.length,
    total: smallTotal,
    shareOfTotal: totalSpent > 0 ? round2((smallTotal / totalSpent) * 100) : 0,
    averageAmount: small.length > 0 ? round2(smallTotal / small.length) : 0,
    projectedYearly: round2(smallTotal * periodsPerYear),
    topMerchants: [...smallByMerchant.entries()]
      .map(([merchant, v]) => ({ merchant, count: v.count, total: round2(v.total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
  };

  // ── Patrones de consumo: mismo comercio repetido ───────────────────────────
  const merchantMap = new Map<string, { count: number; total: number; category: string }>();
  for (const tx of txs) {
    const entry = merchantMap.get(tx.merchant) ?? { count: 0, total: 0, category: tx.category };
    entry.count += 1;
    entry.total += tx.amount;
    merchantMap.set(tx.merchant, entry);
  }

  const patterns: SpendingPattern[] = [...merchantMap.entries()]
    .filter(([, v]) => v.count >= PATTERN_MIN_OCCURRENCES)
    .map(([merchant, v]) => ({
      merchant,
      category: v.category,
      count: v.count,
      total: round2(v.total),
      averageAmount: round2(v.total / v.count),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // ── Evolución del ahorro ───────────────────────────────────────────────────
  // El saldo histórico no se puede reconstruir con fidelidad, porque un fondo
  // puede crearse con saldo inicial sin generar movimiento. Se reporta el flujo
  // neto (que sí es exacto) y el saldo actual.
  const periodFlow = fundMovements
    .filter((m) => m.date >= start && m.date < end)
    .reduce((s, m) => s + (m.type === 'DEPOSIT' ? m.amount : -m.amount), 0);

  const monthlyFlow: { month: string; net: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const net = fundMovements
      .filter((m) => m.date >= mStart && m.date < mEnd)
      .reduce((s, m) => s + (m.type === 'DEPOSIT' ? m.amount : -m.amount), 0);
    monthlyFlow.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      net: round2(net),
    });
  }

  const savings: SavingsSummary = {
    netFundFlow: round2(periodFlow),
    currentFundBalance: round2(funds.reduce((s, f) => s + f.balance, 0)),
    reservedForEvents: round2(events.reduce((s, e) => s + e.savedAmount, 0)),
    monthlyFlow,
  };

  // ── Próximos pagos y celebraciones ─────────────────────────────────────────
  const enrichedEvents = events
    .map((e) => enrichPlannedEvent(e, reference))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  const horizon = new Date(reference.getFullYear(), reference.getMonth() + 2, reference.getDate());

  const upcomingPayments: UpcomingPayment[] = [
    ...fixedExpenses.map((f) => ({
      kind: 'FIXED' as const,
      name: f.name,
      amount: f.amount,
      date: null,
      dayOfMonth: f.dayOfMonth,
    })),
    ...enrichedEvents
      .filter((e) => new Date(e.nextDate) <= horizon)
      .map((e) => ({
        kind: 'EVENT' as const,
        name: e.name,
        amount: e.budgetAmount,
        date: e.nextDate,
        dayOfMonth: null,
        remaining: e.remaining,
      })),
  ];

  const recommendations = buildRecommendations({
    totalSpent,
    byCategory,
    breaches,
    smallExpenses,
    patterns,
    budgetComparison,
    events: enrichedEvents,
    funds,
    fixedExpenses,
    savings,
    periodType: type,
  });

  return {
    period: {
      type,
      start: start.toISOString(),
      end: end.toISOString(),
      label: formatLabel(type, start, end),
    },
    currency: user?.currency ?? 'USD',
    totals: { spent: totalSpent, transactionCount: txs.length, previousSpent, changePercent },
    byCategory,
    byExpenseType,
    budgetComparison,
    breaches,
    smallExpenses,
    patterns,
    savings,
    upcomingPayments,
    recommendations,
  };
}
