import { prisma } from '../lib/prisma';
import { enrichPlannedEvent, nextOccurrence } from './budget';

/**
 * Calendario financiero de 12 meses (sección 7 del plan).
 *
 * Proyecta mes a mes los compromisos conocidos: gastos fijos, eventos
 * previsibles y aportaciones a fondos, frente a los ingresos estimados. Solo
 * usa datos que el usuario ya registró — no supone importes ni fechas.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Fondos alimentados por las provisiones de eventos; no se cuentan aparte. */
const EVENT_BACKED_FUND_TYPES = ['BIRTHDAYS', 'CHRISTMAS', 'VACATION', 'ANNUAL'];

export interface CalendarEvent {
  id: string;
  name: string;
  type: string;
  date: string;
  budgetAmount: number;
  savedAmount: number;
  remaining: number;
}

export interface CalendarMonth {
  year: number;
  month: number;
  label: string;
  /** Ingresos estimados, con criterio prudente si son variables. */
  estimatedIncome: number;
  fixedExpenses: number;
  /** Aportaciones a fondos de emergencia, objetivos e inversión. */
  fundContributions: number;
  events: CalendarEvent[];
  eventsTotal: number;
  /** Fijos + eventos de ese mes + aportaciones a fondos. */
  totalCommitted: number;
  /** Ingresos menos todo lo comprometido ese mes. */
  projectedBalance: number;
  /** true si el mes concentra más compromisos de lo que ingresa. */
  tight: boolean;
}

export interface AnnualCalendar {
  currency: string;
  from: { year: number; month: number };
  months: CalendarMonth[];
  summary: {
    /** Coste de todos los eventos previsibles de los 12 meses. */
    annualEventCost: number;
    /** De ese coste, lo que ya está reservado. */
    alreadyReserved: number;
    annualEventRemaining: number;
    /** Reserva mensual si repartes lo que falta a partes iguales en 12 meses. */
    flatMonthlyReserve: number;
    /**
     * Provisión mensual que de verdad hace falta ahora mismo, respetando la
     * fecha de cada evento. Es mayor que la reserva plana cuando hay eventos
     * cercanos, porque esos no tienen 12 meses para financiarse.
     */
    deadlineAwareMonthlyProvision: number;
    annualFixedCost: number;
    annualEstimatedIncome: number;
    /** Meses con más compromisos que ingresos. */
    tightMonths: string[];
  };
}

export async function computeAnnualCalendar(
  userId: string,
  fromYear: number,
  fromMonth: number
): Promise<AnnualCalendar> {
  const [user, incomes, fixedExpenses, events, funds] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
    prisma.income.findMany({ where: { userId, active: true } }),
    prisma.fixedExpense.findMany({ where: { userId, active: true } }),
    prisma.plannedEvent.findMany({ where: { userId, active: true } }),
    prisma.fund.findMany({ where: { userId } }),
  ]);

  // Un ingreso variable se proyecta con su estimación prudente.
  const recurringIncome = round2(
    incomes
      .filter((i) => i.frequency === 'MONTHLY')
      .reduce((s, i) => s + (i.isVariable ? i.conservativeAmount ?? i.amount : i.amount), 0)
  );

  const monthlyFixed = round2(fixedExpenses.reduce((s, f) => s + f.amount, 0));

  // Las aportaciones a fondos de eventos ya están dentro de la provisión, así
  // que sumarlas otra vez contaría el mismo dinero dos veces.
  const monthlyFundContributions = round2(
    funds
      .filter((f) => !EVENT_BACKED_FUND_TYPES.includes(f.type))
      .reduce((s, f) => s + (f.monthlyContribution ?? 0), 0)
  );

  const windowStart = new Date(fromYear, fromMonth - 1, 1);

  const months: CalendarMonth[] = [];
  const seenEventIds = new Set<string>();
  let annualEventCost = 0;
  let alreadyReserved = 0;
  let annualEstimatedIncome = 0;

  for (let offset = 0; offset < 12; offset++) {
    const cursor = new Date(fromYear, fromMonth - 1 + offset, 1);
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthEnd = new Date(year, month + 1, 1);

    // Eventos que caen en este mes. `nextOccurrence` se calcula desde el
    // comienzo de la ventana para que un evento anual aparezca una sola vez.
    const monthEvents: CalendarEvent[] = [];
    for (const event of events) {
      const occurrence = nextOccurrence(event.eventDate, event.yearlyRecurring, windowStart);
      if (occurrence >= cursor && occurrence < monthEnd) {
        monthEvents.push({
          id: event.id,
          name: event.name,
          type: event.type,
          date: occurrence.toISOString(),
          budgetAmount: event.budgetAmount,
          savedAmount: event.savedAmount,
          remaining: Math.max(0, round2(event.budgetAmount - event.savedAmount)),
        });

        // Cada evento cuenta una sola vez en el total anual, aunque la ventana
        // de 12 meses cruce dos años naturales.
        if (!seenEventIds.has(event.id)) {
          seenEventIds.add(event.id);
          annualEventCost += event.budgetAmount;
          alreadyReserved += event.savedAmount;
        }
      }
    }
    monthEvents.sort((a, b) => a.date.localeCompare(b.date));

    const oneTimeIncome = round2(
      incomes
        .filter(
          (i) =>
            i.frequency === 'ONE_TIME' &&
            i.receivedOn != null &&
            i.receivedOn >= cursor &&
            i.receivedOn < monthEnd
        )
        .reduce((s, i) => s + i.amount, 0)
    );

    const estimatedIncome = round2(recurringIncome + oneTimeIncome);
    const eventsTotal = round2(monthEvents.reduce((s, e) => s + e.budgetAmount, 0));
    const totalCommitted = round2(monthlyFixed + eventsTotal + monthlyFundContributions);

    annualEstimatedIncome += estimatedIncome;

    months.push({
      year,
      month: month + 1,
      label: `${MONTH_NAMES[month]} ${year}`,
      estimatedIncome,
      fixedExpenses: monthlyFixed,
      fundContributions: monthlyFundContributions,
      events: monthEvents,
      eventsTotal,
      totalCommitted,
      projectedBalance: round2(estimatedIncome - totalCommitted),
      tight: estimatedIncome > 0 && totalCommitted > estimatedIncome,
    });
  }

  const annualEventRemaining = Math.max(0, round2(annualEventCost - alreadyReserved));

  // Provisión que respeta la fecha de cada evento, reutilizando el mismo
  // cálculo que usa el presupuesto mensual.
  const deadlineAware = round2(
    events
      .map((e) => enrichPlannedEvent(e, windowStart))
      .reduce((s, e) => s + e.requiredMonthlySaving, 0)
  );

  return {
    currency: user?.currency ?? 'USD',
    from: { year: fromYear, month: fromMonth },
    months,
    summary: {
      annualEventCost: round2(annualEventCost),
      alreadyReserved: round2(alreadyReserved),
      annualEventRemaining,
      flatMonthlyReserve: round2(annualEventRemaining / 12),
      deadlineAwareMonthlyProvision: deadlineAware,
      annualFixedCost: round2(monthlyFixed * 12),
      annualEstimatedIncome: round2(annualEstimatedIncome),
      tightMonths: months.filter((m) => m.tight).map((m) => m.label),
    },
  };
}
