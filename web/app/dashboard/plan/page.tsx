"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { budget as budgetApi, EXPENSE_TYPE_LABELS, type MonthlyBudget } from "@/lib/api";
import { useProfile } from "@/lib/useProfile";
import { Card, Stat, Select, ErrorNote, Progress, Empty } from "@/components/ui";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Una línea del desglose de asignaciones. */
function Row({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2 ${emphasis ? "border-t border-gray-800 pt-3 font-semibold" : ""}`}>
      <div>
        <p className={emphasis ? "text-sm text-white" : "text-sm text-gray-300"}>{label}</p>
        {note && <p className="text-xs text-gray-500">{note}</p>}
      </div>
      <p className={`shrink-0 tabular-nums ${emphasis ? "text-sm text-white" : "text-sm text-gray-200"}`}>
        {value}
      </p>
    </div>
  );
}

export default function PlanPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthlyBudget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { money } = useProfile();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await budgetApi.monthly(year, month));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el presupuesto");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Plan mensual</h1>
          <p className="text-sm text-gray-500">
            Dinero disponible después de cubrir todas tus asignaciones
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-auto">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </div>

      <ErrorNote message={error} />

      {loading && !data ? (
        <Empty message="Cargando…" />
      ) : !data ? null : (
        <>
          {/* Los avisos van arriba: son lo que cambia decisiones */}
          {data.warnings.length > 0 && (
            <div className="space-y-2">
              {data.warnings.map((w, i) => (
                <p
                  key={i}
                  className={`rounded-lg px-3 py-2 text-sm ring-1 ${
                    w.level === "DANGER"
                      ? "bg-rose-950/60 text-rose-300 ring-rose-900"
                      : w.level === "WARN"
                        ? "bg-amber-950/50 text-amber-300 ring-amber-900"
                        : "bg-gray-800/60 text-gray-300 ring-gray-700"
                  }`}
                >
                  {w.message}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Ingresos netos"
              value={money(data.income.total)}
              sub={data.income.usesConservativeEstimate ? "estimación prudente" : undefined}
            />
            <Stat label="Asignado" value={money(data.allocations.total)} />
            <Stat
              label="Disponible"
              value={money(data.available)}
              tone={data.available < 0 ? "bad" : data.available < data.income.total * 0.05 ? "warn" : "good"}
              sub="libre tras todo"
            />
            <Stat label="Gastado este mes" value={money(data.actual.total)} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Cómo se reparte tu dinero">
              <Row
                label="Ingresos netos totales"
                value={money(data.income.total)}
                note={
                  data.income.oneTime > 0
                    ? `${money(data.income.recurring)} recurrente + ${money(data.income.oneTime)} puntual`
                    : undefined
                }
              />
              <div className="my-2 border-t border-gray-800" />
              <Row label="Gastos fijos mensuales" value={`− ${money(data.allocations.fixedExpenses)}`} />
              <Row label="Gastos variables presupuestados" value={`− ${money(data.allocations.variableBudget)}`} />
              <Row
                label="Provisión para gastos anuales"
                value={`− ${money(data.allocations.eventProvisions)}`}
                note="dinero que se aparta, no que se gasta"
              />
              <Row label="Fondo de emergencia" value={`− ${money(data.allocations.emergencyFund)}`} />
              <Row label="Ahorro e inversión" value={`− ${money(data.allocations.savingsAndInvestment)}`} />
              <Row label="Disponible" value={money(data.available)} emphasis />
            </Card>

            <Card title="Presupuesto vs. gasto real">
              <Row
                label="Gastos fijos"
                value={`${money(data.comparison.fixed.actual)} / ${money(data.comparison.fixed.budgeted)}`}
                note={
                  data.comparison.fixed.difference < 0
                    ? `${money(Math.abs(data.comparison.fixed.difference))} por encima de lo previsto`
                    : `${money(data.comparison.fixed.difference)} por debajo`
                }
              />
              <div className="mb-3">
                <Progress
                  value={
                    data.comparison.fixed.budgeted > 0
                      ? (data.comparison.fixed.actual / data.comparison.fixed.budgeted) * 100
                      : 0
                  }
                  tone={data.comparison.fixed.difference < 0 ? "amber" : "indigo"}
                />
              </div>
              <Row
                label="Gastos variables cotidianos"
                value={`${money(data.comparison.variable.actual)} / ${money(data.comparison.variable.budgeted)}`}
                note={
                  data.comparison.variable.difference < 0
                    ? `${money(Math.abs(data.comparison.variable.difference))} por encima del límite`
                    : `te queda ${money(data.comparison.variable.difference)}`
                }
              />
              <div className="mb-3">
                <Progress
                  value={
                    data.comparison.variable.budgeted > 0
                      ? (data.comparison.variable.actual / data.comparison.variable.budgeted) * 100
                      : 0
                  }
                  tone={data.comparison.variable.difference < 0 ? "amber" : "emerald"}
                />
              </div>
              <Row
                label="Gastos previsibles pagados"
                value={money(data.comparison.planned.actual)}
                note="cubiertos con dinero reservado de antemano"
              />
              <Row
                label="Gastos imprevistos"
                value={money(data.comparison.unexpected.actual)}
                note="nunca se mezclan con los previsibles"
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Gasto real por tipo">
              {data.actual.total === 0 ? (
                <Empty message="Sin gastos registrados este mes." />
              ) : (
                (Object.keys(EXPENSE_TYPE_LABELS) as (keyof typeof EXPENSE_TYPE_LABELS)[]).map((type) => (
                  <div key={type} className="py-2">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-300">{EXPENSE_TYPE_LABELS[type]}</span>
                      <span className="tabular-nums text-gray-200">{money(data.actual.byType[type] ?? 0)}</span>
                    </div>
                    <Progress
                      value={
                        data.actual.total > 0
                          ? ((data.actual.byType[type] ?? 0) / data.actual.total) * 100
                          : 0
                      }
                    />
                  </div>
                ))
              )}
            </Card>

            <Card
              title="Próximos compromisos"
              action={
                <Link href="/dashboard/planned" className="text-xs text-indigo-400 hover:text-indigo-300">
                  Ver todos
                </Link>
              }
            >
              {data.upcomingEvents.length === 0 ? (
                <Empty message="No has registrado gastos previsibles todavía." />
              ) : (
                <div className="space-y-3">
                  {data.upcomingEvents.map((e) => (
                    <div key={e.id}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-gray-200">{e.name}</span>
                        <span className="shrink-0 text-xs text-gray-500">
                          {new Date(e.nextDate).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                          {" · "}
                          {e.monthsRemaining} {e.monthsRemaining === 1 ? "mes" : "meses"}
                        </span>
                      </div>
                      <Progress value={e.progress} tone={e.monthsRemaining === 1 && e.remaining > 0 ? "amber" : "emerald"} />
                      <p className="mt-1 text-xs text-gray-500">
                        {money(e.savedAmount)} de {money(e.budgetAmount)}
                        {e.requiredMonthlySaving > 0 && ` · aparta ${money(e.requiredMonthlySaving)}/mes`}
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
