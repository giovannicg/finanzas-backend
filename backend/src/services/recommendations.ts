import type { Fund, FixedExpense } from '@prisma/client';
import type { EnrichedPlannedEvent } from './budget';
import type {
  BudgetBreach,
  BudgetComparisonSummary,
  CategorySpend,
  ReportPeriodType,
  SavingsSummary,
  SmallExpenseAnalysis,
  SpendingPattern,
} from './reports';

/**
 * Recomendaciones del informe (sección 8 del plan).
 *
 * Reglas que este módulo respeta de forma deliberada:
 *
 *  - Nunca propone eliminar el ocio. Señala el importe acumulado y deja la
 *    decisión al usuario, porque el objetivo es equilibrio, no privación.
 *  - Prioriza cubrir obligaciones antes que optimizar ahorro.
 *  - Avisa cuando un gasto compromete el presupuesto.
 *  - No supone importes ni fechas que el usuario no haya dado: cada cifra que
 *    aparece en un consejo viene de un dato registrado. Las proyecciones se
 *    nombran como tales.
 *  - Objetivos realistas: cualquier cantidad sugerida se deriva de lo que el
 *    usuario ya gasta o ingresa, nunca de un porcentaje inventado.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Meses de gastos fijos que se consideran un fondo de emergencia sano. */
const EMERGENCY_MONTHS_TARGET = 3;

/** Desde qué porcentaje del gasto total los gastos pequeños merecen mención. */
const SMALL_EXPENSE_NOTABLE_SHARE = 15;

export interface Recommendation {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
}

export interface RecommendationInput {
  totalSpent: number;
  byCategory: CategorySpend[];
  breaches: BudgetBreach[];
  smallExpenses: SmallExpenseAnalysis;
  patterns: SpendingPattern[];
  budgetComparison: BudgetComparisonSummary | null;
  events: EnrichedPlannedEvent[];
  funds: Fund[];
  fixedExpenses: FixedExpense[];
  savings: SavingsSummary;
  periodType: ReportPeriodType;
}

/** Importes sin moneda: el frontend los formatea con la del usuario. */
const n = (value: number) => value.toFixed(2);

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const {
    totalSpent,
    breaches,
    smallExpenses,
    patterns,
    budgetComparison,
    events,
    funds,
    fixedExpenses,
    savings,
    periodType,
  } = input;

  const out: Recommendation[] = [];

  // ── Sin datos no hay consejo que dar ──────────────────────────────────────
  if (totalSpent === 0 && !budgetComparison) {
    return [
      {
        priority: 'LOW',
        title: 'Aún no hay datos de este periodo',
        detail:
          'No hay gastos registrados, así que no puedo analizar nada todavía. En cuanto registres movimientos aparecerán aquí las conclusiones.',
      },
    ];
  }

  // ── Prioridad 1: obligaciones y presupuesto comprometido ──────────────────
  if (budgetComparison && budgetComparison.income > 0 && budgetComparison.available < 0) {
    out.push({
      priority: 'HIGH',
      title: 'Tus asignaciones superan tus ingresos',
      detail:
        `Has asignado ${n(budgetComparison.allocated)} sobre unos ingresos de ${n(budgetComparison.income)}, ` +
        `un desfase de ${n(Math.abs(budgetComparison.available))}. Cubrir obligaciones es lo primero: revisa si algún ` +
        'presupuesto de evento es más alto de lo necesario o si alguna aportación a fondos puede esperar, antes de recortar gasto corriente.',
    });
  }

  const urgentEvents = events.filter((e) => e.monthsRemaining === 1 && e.remaining > 0);
  for (const event of urgentEvents) {
    out.push({
      priority: 'HIGH',
      title: `"${event.name}" llega este mes sin estar cubierto`,
      detail:
        `Faltan ${n(event.remaining)} de un presupuesto de ${n(event.budgetAmount)}. ` +
        'Si no puedes apartar esa cantidad ahora, baja el presupuesto del evento a lo que sí tengas reservado: ' +
        'es mejor ajustar la expectativa que pagarlo con dinero de otra cosa.',
    });
  }

  // ── Prioridad 2: límites excedidos ────────────────────────────────────────
  for (const breach of breaches.slice(0, 3)) {
    out.push({
      priority: 'MEDIUM',
      title: `${breach.category} superó su límite`,
      detail:
        `Llevas ${n(breach.spent)} frente a un límite de ${n(breach.limitAmount)} para este periodo, ` +
        `${n(breach.overBy)} por encima. Decide tú si el límite era demasiado ajustado o si fue un periodo atípico: ` +
        'un límite que incumples todos los meses no te sirve de nada.',
    });
  }

  // ── Prioridad 2: gastos pequeños acumulados ───────────────────────────────
  // Se expone el dato y la proyección. No se pide eliminarlos.
  if (
    smallExpenses.count >= 5 &&
    smallExpenses.shareOfTotal >= SMALL_EXPENSE_NOTABLE_SHARE
  ) {
    const topMerchant = smallExpenses.topMerchants[0];
    out.push({
      priority: 'MEDIUM',
      title: 'Los gastos pequeños suman más de lo que parece',
      detail:
        `${smallExpenses.count} gastos de ${n(smallExpenses.threshold)} o menos suman ${n(smallExpenses.total)}, ` +
        `el ${smallExpenses.shareOfTotal}% de todo lo que gastaste. Al ritmo de este ${periodType === 'week' ? 'semana' : 'mes'} ` +
        `serían unos ${n(smallExpenses.projectedYearly)} al año (proyección, no un dato cerrado)` +
        (topMerchant ? `, y ${topMerchant.merchant} concentra ${n(topMerchant.total)} en ${topMerchant.count} visitas` : '') +
        '. No hace falta que los elimines: con reducirlos a la mitad ya liberarías la mitad de esa cifra.',
    });
  }

  // ── Prioridad 3: patrones de consumo ──────────────────────────────────────
  const topPattern = patterns[0];
  if (topPattern && topPattern.count >= 4) {
    out.push({
      priority: 'LOW',
      title: `${topPattern.merchant} se repite ${topPattern.count} veces`,
      detail:
        `Has gastado ${n(topPattern.total)} ahí, de media ${n(topPattern.averageAmount)} por vez. ` +
        'Si es algo que disfrutas, está bien que esté en tu presupuesto; lo útil es que sea una decisión consciente y no una costumbre invisible.',
    });
  }

  // ── Prioridad 1-2: fondo de emergencia ────────────────────────────────────
  const monthlyFixed = round2(fixedExpenses.reduce((s, f) => s + f.amount, 0));
  const emergencyFunds = funds.filter((f) => f.type === 'EMERGENCY');
  const emergencyBalance = round2(emergencyFunds.reduce((s, f) => s + f.balance, 0));

  if (emergencyFunds.length === 0) {
    out.push({
      priority: 'HIGH',
      title: 'No tienes fondo de emergencia',
      detail:
        monthlyFixed > 0
          ? `Tus gastos fijos son ${n(monthlyFixed)} al mes. Un objetivo razonable son ${EMERGENCY_MONTHS_TARGET} meses, ` +
            `es decir ${n(monthlyFixed * EMERGENCY_MONTHS_TARGET)}. Empieza por lo que puedas: sin este colchón, ` +
            'cualquier imprevisto sale del dinero que ya tenías reservado para otra cosa.'
          : 'Es la primera defensa ante un imprevisto. Registra tus gastos fijos y te diré qué objetivo tiene sentido en tu caso.',
    });
  } else if (monthlyFixed > 0) {
    const target = round2(monthlyFixed * EMERGENCY_MONTHS_TARGET);
    const monthsCovered = round2(emergencyBalance / monthlyFixed);

    if (emergencyBalance < target) {
      out.push({
        priority: 'MEDIUM',
        title: `Tu fondo de emergencia cubre ${monthsCovered} meses`,
        detail:
          `Tienes ${n(emergencyBalance)} y tus gastos fijos son ${n(monthlyFixed)} al mes. ` +
          `Para llegar a ${EMERGENCY_MONTHS_TARGET} meses faltan ${n(target - emergencyBalance)}. ` +
          'No hay prisa por llegar de golpe: una aportación constante y sostenible vale más que un esfuerzo que abandonas en dos meses.',
      });
    } else {
      out.push({
        priority: 'LOW',
        title: 'Tu fondo de emergencia está en buen estado',
        detail:
          `Cubre ${monthsCovered} meses de gastos fijos. A partir de aquí, lo que aportes de más rinde más en un objetivo ` +
          'concreto o en inversión que acumulado en el fondo de emergencia.',
      });
    }
  }

  // ── Equilibrio: cuando hay margen, decirlo ────────────────────────────────
  if (
    budgetComparison &&
    budgetComparison.income > 0 &&
    budgetComparison.available > budgetComparison.income * 0.15
  ) {
    out.push({
      priority: 'LOW',
      title: 'Te sobra margen este mes',
      detail:
        `Quedan ${n(budgetComparison.available)} sin asignar. Puedes repartirlo entre adelantar provisiones de eventos, ` +
        'subir una aportación a fondos o simplemente disfrutarlo: tener margen sin asignar también es una forma válida de usarlo.',
    });
  }

  // ── Ahorro que retrocede ──────────────────────────────────────────────────
  if (savings.netFundFlow < 0) {
    out.push({
      priority: 'MEDIUM',
      title: 'Este periodo retiraste más de tus fondos de lo que aportaste',
      detail:
        `El saldo neto de tus fondos bajó ${n(Math.abs(savings.netFundFlow))}. Si fue para pagar un evento previsible, ` +
        'es exactamente para lo que estaban. Si fue para cubrir gasto corriente, conviene revisar si el presupuesto variable está bien calibrado.',
    });
  }

  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return out.sort((a, b) => order[a.priority] - order[b.priority]);
}
