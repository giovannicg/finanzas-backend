"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  reports as api,
  EXPENSE_TYPE_LABELS,
  type ExpenseType,
  type FinancialReport,
  type ReportPeriodType,
} from "@/lib/api";
import { useProfile } from "@/lib/useProfile";
import { Card, Stat, Field, Input, Button, ErrorNote, Empty, Progress } from "@/components/ui";

const TODAY = () => new Date().toISOString().slice(0, 10);

const PRIORITY_STYLES = {
  HIGH: "bg-rose-950/50 text-rose-200 ring-rose-900",
  MEDIUM: "bg-amber-950/40 text-amber-200 ring-amber-900",
  LOW: "bg-gray-800/60 text-gray-300 ring-gray-700",
} as const;

const PRIORITY_LABELS = {
  HIGH: "Prioritario",
  MEDIUM: "A revisar",
  LOW: "Para tener en cuenta",
} as const;

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriodType>("month");
  const [date, setDate] = useState(TODAY());
  const [threshold, setThreshold] = useState("10");
  const [data, setData] = useState<FinancialReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { money } = useProfile();

  const load = useCallback(
    async (smallThreshold?: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await api.get({ period, date, smallThreshold }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar el informe");
      } finally {
        setLoading(false);
      }
    },
    [period, date]
  );

  // Al cambiar periodo o fecha se recarga con el umbral por defecto del backend.
  useEffect(() => { load(); }, [load]);

  /** El umbral se aplica al pulsar, no en cada tecla. */
  function applyThreshold() {
    const parsed = parseFloat(threshold);
    load(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
  }

  const change = data?.totals.changePercent;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Informes</h1>
          <p className="text-sm text-gray-500">
            {data ? data.period.label : "Análisis de tu periodo"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-gray-700">
            {(["week", "month"] as ReportPeriodType[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`cursor-pointer px-4 py-2 text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {p === "week" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
        </div>
      </div>

      <ErrorNote message={error} />

      {loading && !data ? (
        <Empty message="Cargando…" />
      ) : !data ? null : (
        <>
          {/* Recomendaciones primero: es lo único accionable del informe */}
          {data.recommendations.length > 0 && (
            <Card title="Recomendaciones">
              <div className="space-y-3">
                {data.recommendations.map((rec, i) => (
                  <div key={i} className={`rounded-lg p-3 ring-1 ${PRIORITY_STYLES[rec.priority]}`}>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {PRIORITY_LABELS[rec.priority]}
                      </span>
                      <p className="text-sm font-semibold">{rec.title}</p>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">{rec.detail}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total gastado" value={money(data.totals.spent)} />
            <Stat
              label={period === "week" ? "Semana anterior" : "Mes anterior"}
              value={money(data.totals.previousSpent)}
              sub={
                change == null
                  ? "sin referencia previa"
                  : `${change > 0 ? "+" : ""}${change}% ahora`
              }
              tone={change == null ? "neutral" : change > 0 ? "warn" : "good"}
            />
            <Stat label="Movimientos" value={String(data.totals.transactionCount)} />
            <Stat
              label="Saldo en fondos"
              value={money(data.savings.currentFundBalance)}
              sub={`${money(data.savings.reservedForEvents)} etiquetado para eventos`}
            />
          </div>

          {/* Presupuesto vs. real: solo tiene sentido en el informe mensual */}
          {data.budgetComparison && (
            <Card title="Presupuesto vs. gasto real">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Ingresos</p>
                  <p className="text-lg font-semibold text-white">
                    {money(data.budgetComparison.income)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Asignado</p>
                  <p className="text-lg font-semibold text-white">
                    {money(data.budgetComparison.allocated)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Disponible</p>
                  <p
                    className={`text-lg font-semibold ${
                      data.budgetComparison.available < 0 ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {money(data.budgetComparison.available)}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {[
                  {
                    label: "Gastos fijos",
                    budgeted: data.budgetComparison.fixedBudgeted,
                    actual: data.budgetComparison.fixedActual,
                  },
                  {
                    label: "Gastos variables cotidianos",
                    budgeted: data.budgetComparison.variableBudgeted,
                    actual: data.budgetComparison.variableActual,
                  },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-300">{row.label}</span>
                      <span className="tabular-nums text-gray-400">
                        {money(row.actual)} / {money(row.budgeted)}
                      </span>
                    </div>
                    <Progress
                      value={row.budgeted > 0 ? (row.actual / row.budgeted) * 100 : 0}
                      tone={row.actual > row.budgeted ? "amber" : "emerald"}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Distribución por categoría */}
            <Card title="Distribución por categoría">
              {data.byCategory.length === 0 ? (
                <Empty message="Sin gastos en este periodo." />
              ) : (
                <div className="space-y-3">
                  {data.byCategory.map((cat) => (
                    <div key={cat.category}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="truncate text-gray-300">{cat.category}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-400">
                          {money(cat.total)}
                          <span className="ml-2 text-xs text-gray-600">{cat.share}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${cat.share}%`, backgroundColor: cat.color }}
                        />
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600">
                        {cat.count} {cat.count === 1 ? "movimiento" : "movimientos"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Por tipo de gasto */}
            <Card title="Por tipo de gasto">
              {data.totals.spent === 0 ? (
                <Empty message="Sin gastos en este periodo." />
              ) : (
                <div className="space-y-3">
                  {(Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map((type) => (
                    <div key={type}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-gray-300">{EXPENSE_TYPE_LABELS[type]}</span>
                        <span className="tabular-nums text-gray-400">
                          {money(data.byExpenseType[type] ?? 0)}
                        </span>
                      </div>
                      <Progress
                        value={
                          data.totals.spent > 0
                            ? ((data.byExpenseType[type] ?? 0) / data.totals.spent) * 100
                            : 0
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Categorías excedidas */}
          {data.breaches.length > 0 && (
            <Card title="Categorías donde gastaste más de lo previsto">
              <div className="divide-y divide-gray-800">
                {data.breaches.map((b) => (
                  <div key={b.category} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">{b.category}</p>
                      <p className="text-xs text-gray-500">
                        límite prorrateado del periodo: {money(b.limitAmount)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tabular-nums text-amber-400">+{money(b.overBy)}</p>
                      <p className="text-xs text-gray-500">{b.percentage}% del límite</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Gastos pequeños acumulados */}
            <Card
              title="Gastos pequeños acumulados"
              action={
                <div className="flex items-end gap-2">
                  <Field label="Umbral">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="w-20"
                    />
                  </Field>
                  <Button variant="ghost" onClick={applyThreshold} className="px-3 py-2 text-xs">
                    Aplicar
                  </Button>
                </div>
              }
            >
              {data.smallExpenses.count === 0 ? (
                <Empty
                  message={`Ningún gasto de ${money(data.smallExpenses.threshold)} o menos en este periodo.`}
                />
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Suman</p>
                      <p className="text-xl font-bold text-white">
                        {money(data.smallExpenses.total)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {data.smallExpenses.count} gastos · {data.smallExpenses.shareOfTotal}% del
                        total
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Proyección anual
                      </p>
                      <p className="text-xl font-bold text-amber-400">
                        {money(data.smallExpenses.projectedYearly)}
                      </p>
                      <p className="text-xs text-gray-500">
                        a este ritmo · media {money(data.smallExpenses.averageAmount)}
                      </p>
                    </div>
                  </div>

                  {data.smallExpenses.topMerchants.length > 0 && (
                    <div className="divide-y divide-gray-800 border-t border-gray-800">
                      {data.smallExpenses.topMerchants.map((m) => (
                        <div
                          key={m.merchant}
                          className="flex items-center justify-between py-2 text-sm"
                        >
                          <span className="truncate text-gray-300">{m.merchant}</span>
                          <span className="shrink-0 tabular-nums text-gray-400">
                            {money(m.total)}
                            <span className="ml-2 text-xs text-gray-600">×{m.count}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Patrones de consumo */}
            <Card title="Patrones de consumo">
              {data.patterns.length === 0 ? (
                <Empty message="Ningún comercio se repite tres veces o más en este periodo." />
              ) : (
                <div className="divide-y divide-gray-800">
                  {data.patterns.map((p) => (
                    <div key={p.merchant} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-200">{p.merchant}</p>
                        <p className="text-xs text-gray-500">
                          {p.category} · {p.count} veces · media {money(p.averageAmount)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm tabular-nums text-gray-300">
                        {money(p.total)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Evolución del ahorro */}
            <Card title="Evolución del ahorro">
              <div className="mb-4 flex items-center gap-2">
                {data.savings.netFundFlow >= 0 ? (
                  <TrendingUp size={18} className="text-emerald-400" />
                ) : (
                  <TrendingDown size={18} className="text-rose-400" />
                )}
                <div>
                  <p
                    className={`text-lg font-bold ${
                      data.savings.netFundFlow >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {data.savings.netFundFlow >= 0 ? "+" : ""}
                    {money(data.savings.netFundFlow)}
                  </p>
                  <p className="text-xs text-gray-500">aportación neta a fondos en el periodo</p>
                </div>
              </div>

              <div className="space-y-2">
                {data.savings.monthlyFlow.map((m) => {
                  const max = Math.max(...data.savings.monthlyFlow.map((x) => Math.abs(x.net)), 1);
                  const width = (Math.abs(m.net) / max) * 100;
                  return (
                    <div key={m.month} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-xs text-gray-500">{m.month}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className={`h-full rounded-full ${
                            m.net >= 0 ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-gray-400">
                        {money(m.net)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-gray-600">
                Se muestra el flujo neto registrado, no el saldo histórico: un fondo creado con
                saldo inicial no genera movimiento, así que reconstruirlo sería inventar datos.
              </p>
            </Card>

            {/* Próximos pagos y celebraciones */}
            <Card title="Próximos pagos y celebraciones">
              {data.upcomingPayments.length === 0 ? (
                <Empty message="Sin compromisos registrados." />
              ) : (
                <div className="divide-y divide-gray-800">
                  {data.upcomingPayments.map((p, i) => (
                    <div
                      key={`${p.kind}-${p.name}-${i}`}
                      className="flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-200">{p.name}</p>
                        <p className="text-xs text-gray-500">
                          {p.kind === "FIXED"
                            ? p.dayOfMonth
                              ? `gasto fijo · día ${p.dayOfMonth}`
                              : "gasto fijo mensual"
                            : p.date
                              ? new Date(p.date).toLocaleDateString("es", {
                                  day: "2-digit",
                                  month: "long",
                                })
                              : "evento previsible"}
                          {p.kind === "EVENT" && p.remaining != null && p.remaining > 0 && (
                            <span className="text-amber-400"> · faltan {money(p.remaining)}</span>
                          )}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm tabular-nums text-gray-300">
                        {money(p.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
