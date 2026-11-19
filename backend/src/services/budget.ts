import { prisma } from '../lib/prisma';
import type { PlannedEvent } from '@prisma/client';

/**
 * Motor de presupuesto.
 *
 * Reglas de dinero que este módulo respeta de forma estricta:
 *
 *  - GASTO      → una Transaction. Es dinero que ya salió.
 *  - PROVISIÓN  → el ahorro mensual necesario para un evento futuro. NO es un
 *                 gasto: es dinero que se aparta. Se resta del dinero disponible
 *                 una sola vez, en el mes en que se aparta.
 *  - RESERVADO  → `PlannedEvent.savedAmount` / `Fund.balance`. Dinero que ya
 *                 existe apartado. Nunca se vuelve a restar del presupuesto.
 *  - AHORRO     → aportación a fondos de emergencia, objetivos o inversión.
 *
 * El doble conteo se evita de dos formas:
 *  1. La provisión de un evento se calcula sobre lo que FALTA
 *     (`budgetAmount - savedAmount`), no sobre el presupuesto total.
 *  2. Los fondos cuyo propósito es cubrir eventos previsibles
 *     (BIRTHDAYS, CHRISTMAS, VACATION, ANNUAL) NO suman su aportación mensual
 *     al presupuesto, porque ese dinero ya está contado en las provisiones.
 */

export const EXPENSE_TYPES = ['FIXED', 'PLANNED', 'VARIABLE', 'UNEXPECTED'] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

/** Fondos alimentados por las provisiones de eventos — no se cuentan aparte. */
const EVENT_BACKED_FUND_TYPES = ['BIRTHDAYS', 'CHRISTMAS', 'VACATION', 'ANNUAL'];
const EMERGENCY_FUND_TYPES = ['EMERGENCY'];
const SAVINGS_FUND_TYPES = ['GOAL', 'INVESTMENT'];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Próxima fecha en la que ocurre el evento, a partir del mes de referencia.
 * Un evento que cae en el mes de referencia cuenta como "este mes", aunque el
 * día ya haya pasado: sigue perteneciendo al presupuesto del mes en curso.
 */
export function nextOccurrence(eventDate: Date, yearlyRecurring: boolean, reference: Date): Date {
  if (!yearlyRecurring) return new Date(eventDate);

  const referenceMonthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const candidate = new Date(eventDate);
  candidate.setFullYear(reference.getFullYear());

  if (candidate < referenceMonthStart) {
    candidate.setFullYear(reference.getFullYear() + 1);
  }
  return candidate;
}

/**
 * Meses que quedan para el evento, contando el mes del evento.
 * Mínimo 1: si el evento es este mes, lo que falte hay que reservarlo ahora.
 */
export function monthsRemainingUntil(target: Date, reference: Date): number {
  const diff =
    (target.getFullYear() - reference.getFullYear()) * 12 +
    (target.getMonth() - reference.getMonth());
  return Math.max(1, diff + 1);
}

export interface EnrichedPlannedEvent {
  id: string;
  name: string;
  type: string;
  eventDate: string;
  nextDate: string;
  yearlyRecurring: boolean;
  budgetAmount: number;
  savedAmount: number;
  /** Lo que falta por reservar. */
  remaining: number;
  monthsRemaining: number;
  /** Cuánto hay que apartar cada mes para llegar con el dinero completo. */
  requiredMonthlySaving: number;
  /** 0–100. Porcentaje del presupuesto del evento ya reservado. */
  progress: number;
  fundId: string | null;
  notes: string | null;
}

/** Añade al evento los cálculos de provisión. Esta es la sección 1.B del plan. */
export function enrichPlannedEvent(event: PlannedEvent, reference = new Date()): EnrichedPlannedEvent {
  const nextDate = nextOccurrence(event.eventDate, event.yearlyRecurring, reference);
  const monthsRemaining = monthsRemainingUntil(nextDate, reference);
  const remaining = Math.max(0, round2(event.budgetAmount - event.savedAmount));

  return {
    id: event.id,
    name: event.name,
    type: event.type,
    eventDate: event.eventDate.toISOString(),
    nextDate: nextDate.toISOString(),
    yearlyRecurring: event.yearlyRecurring,
    budgetAmount: event.budgetAmount,
    savedAmount: event.savedAmount,
    remaining,
    monthsRemaining,
    requiredMonthlySaving: round2(remaining / monthsRemaining),
    progress: event.budgetAmount > 0
      ? Math.min(100, round2((event.savedAmount / event.budgetAmount) * 100))
      : 0,
    fundId: event.fundId,
    notes: event.notes,
  };
}

export interface BudgetWarning {
  level: 'INFO' | 'WARN' | 'DANGER';
  message: string;
}

export interface MonthlyBudget {
  year: number;
  month: number;
  currency: string;
  income: {
    recurring: number;
    oneTime: number;
    total: number;
    /** true si algún ingreso es variable y se está usando una estimación prudente. */
    usesConservativeEstimate: boolean;
  };
  allocations: {
    fixedExpenses: number;
    variableBudget: number;
    eventProvisions: number;
    emergencyFund: number;
    savingsAndInvestment: number;
    total: number;
  };
  /** Dinero libre después de cubrir todas las asignaciones. */
  available: number;
  actual: {
    byType: Record<ExpenseType, number>;
    total: number;
  };
  /** Presupuestado vs. gastado por cada bloque. */
  comparison: {
    fixed: { budgeted: number; actual: number; difference: number };
    variable: { budgeted: number; actual: number; difference: number };
    planned: { actual: number };
    unexpected: { actual: number };
  };
  upcomingEvents: EnrichedPlannedEvent[];
  warnings: BudgetWarning[];
}

export async function computeMonthlyBudget(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyBudget> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [user, incomes, fixedExpenses, alerts, events, funds, actualRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
    prisma.income.findMany({ where: { userId, active: true } }),
    prisma.fixedExpense.findMany({ where: { userId, active: true } }),
    prisma.alert.findMany({ where: { userId, active: true } }),
    prisma.plannedEvent.findMany({ where: { userId, active: true } }),
    prisma.fund.findMany({ where: { userId } }),
    prisma.transaction.groupBy({
      by: ['expenseType'],
      where: { userId, date: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
  ]);

  // ── Ingresos ───────────────────────────────────────────────────────────────
  // Para un ingreso variable se planifica con la estimación conservadora.
  let recurringIncome = 0;
  let usesConservativeEstimate = false;
  for (const income of incomes) {
    if (income.frequency !== 'MONTHLY') continue;
    if (income.isVariable) {
      usesConservativeEstimate = true;
      recurringIncome += income.conservativeAmount ?? income.amount;
    } else {
      recurringIncome += income.amount;
    }
  }

  const oneTimeIncome = incomes
    .filter(
      (i) =>
        i.frequency === 'ONE_TIME' &&
        i.receivedOn != null &&
        i.receivedOn >= monthStart &&
        i.receivedOn < monthEnd
    )
    .reduce((sum, i) => sum + i.amount, 0);

  const totalIncome = round2(recurringIncome + oneTimeIncome);

  // ── Asignaciones ───────────────────────────────────────────────────────────
  const fixedTotal = round2(fixedExpenses.reduce((sum, e) => sum + e.amount, 0));

  // Los límites semanales se normalizan a mes (52 semanas / 12 meses).
  const variableBudget = round2(
    alerts.reduce(
      (sum, a) => sum + (a.period === 'weekly' ? a.limitAmount * (52 / 12) : a.limitAmount),
      0
    )
  );

  const enrichedEvents = events
    .map((e) => enrichPlannedEvent(e, monthStart))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  const eventProvisions = round2(
    enrichedEvents.reduce((sum, e) => sum + e.requiredMonthlySaving, 0)
  );

  const emergencyFund = round2(
    funds
      .filter((f) => EMERGENCY_FUND_TYPES.includes(f.type))
      .reduce((sum, f) => sum + (f.monthlyContribution ?? 0), 0)
  );

  const savingsAndInvestment = round2(
    funds
      .filter((f) => SAVINGS_FUND_TYPES.includes(f.type))
      .reduce((sum, f) => sum + (f.monthlyContribution ?? 0), 0)
  );

  const allocationsTotal = round2(
    fixedTotal + variableBudget + eventProvisions + emergencyFund + savingsAndInvestment
  );
  const available = round2(totalIncome - allocationsTotal);

  // ── Gasto real del mes ─────────────────────────────────────────────────────
  const byType = EXPENSE_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<ExpenseType, number>
  );
  for (const row of actualRows) {
    const type = (EXPENSE_TYPES as readonly string[]).includes(row.expenseType)
      ? (row.expenseType as ExpenseType)
      : 'VARIABLE';
    byType[type] = round2(byType[type] + (row._sum.amount ?? 0));
  }
  const actualTotal = round2(Object.values(byType).reduce((a, b) => a + b, 0));

  // ── Avisos ─────────────────────────────────────────────────────────────────
  const warnings: BudgetWarning[] = [];

  if (totalIncome === 0) {
    warnings.push({
      level: 'INFO',
      message: 'Aún no has registrado ingresos, así que el presupuesto no puede calcularse.',
    });
  } else if (available < 0) {
    warnings.push({
      level: 'DANGER',
      message: `Tus asignaciones superan tus ingresos en ${Math.abs(available).toFixed(2)}. Hay que reducir algún bloque o ajustar un presupuesto de evento.`,
    });
  } else if (available < totalIncome * 0.05) {
    warnings.push({
      level: 'WARN',
      message: 'Te queda menos del 5% de tus ingresos sin asignar. Cualquier imprevisto comprometería el mes.',
    });
  }

  const urgent = enrichedEvents.filter((e) => e.monthsRemaining === 1 && e.remaining > 0);
  for (const event of urgent) {
    warnings.push({
      level: 'WARN',
      message: `"${event.name}" es este mes y faltan ${event.remaining.toFixed(2)} por reservar.`,
    });
  }

  // El dinero etiquetado para eventos no puede superar el saldo real del fondo.
  for (const fund of funds) {
    const allocated = events
      .filter((e) => e.fundId === fund.id)
      .reduce((sum, e) => sum + e.savedAmount, 0);
    if (allocated > fund.balance + 0.01) {
      warnings.push({
        level: 'DANGER',
        message: `El fondo "${fund.name}" tiene ${allocated.toFixed(2)} etiquetados para eventos pero solo ${fund.balance.toFixed(2)} de saldo real.`,
      });
    }
  }

  if (byType.VARIABLE > variableBudget && variableBudget > 0) {
    warnings.push({
      level: 'WARN',
      message: `Has gastado ${(byType.VARIABLE - variableBudget).toFixed(2)} más de lo previsto en gastos variables cotidianos.`,
    });
  }

  if (emergencyFund === 0 && funds.every((f) => !EMERGENCY_FUND_TYPES.includes(f.type))) {
    warnings.push({
      level: 'INFO',
      message: 'No tienes fondo de emergencia. Es la primera defensa ante un imprevisto.',
    });
  }

  // Los fondos de eventos no suman aparte; se avisa si el usuario los duplicó.
  const duplicated = funds.filter(
    (f) => EVENT_BACKED_FUND_TYPES.includes(f.type) && (f.monthlyContribution ?? 0) > 0
  );
  for (const fund of duplicated) {
    warnings.push({
      level: 'INFO',
      message: `El fondo "${fund.name}" se alimenta de las provisiones de tus eventos, así que su aportación mensual no se suma otra vez al presupuesto.`,
    });
  }

  return {
    year,
    month,
    currency: user?.currency ?? 'USD',
    income: {
      recurring: round2(recurringIncome),
      oneTime: round2(oneTimeIncome),
      total: totalIncome,
      usesConservativeEstimate,
    },
    allocations: {
      fixedExpenses: fixedTotal,
      variableBudget,
      eventProvisions,
      emergencyFund,
      savingsAndInvestment,
      total: allocationsTotal,
    },
    available,
    actual: { byType, total: actualTotal },
    comparison: {
      fixed: {
        budgeted: fixedTotal,
        actual: byType.FIXED,
        difference: round2(fixedTotal - byType.FIXED),
      },
      variable: {
        budgeted: variableBudget,
        actual: byType.VARIABLE,
        difference: round2(variableBudget - byType.VARIABLE),
      },
      planned: { actual: byType.PLANNED },
      unexpected: { actual: byType.UNEXPECTED },
    },
    upcomingEvents: enrichedEvents.slice(0, 8),
    warnings,
  };
}
