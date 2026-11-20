"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  reports as api,
  PLANNED_EVENT_TYPE_LABELS,
  type AnnualCalendar,
  type CalendarMonth,
  type PlannedEventType,
} from "@/lib/api";
import { useProfile } from "@/lib/useProfile";
import { Card, Stat, Select, ErrorNote, Empty, Progress } from "@/components/ui";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function MonthCard({
  m,
  money,
  maxCommitted,
}: {
  m: CalendarMonth;
  money: (n: number) => string;
  maxCommitted: number;
}) {
  return (
    <div
      className={`rounded-xl p-4 ring-1 ${
        m.tight ? "bg-amber-950/30 ring-amber-900" : "bg-gray-900 ring-gray-800"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{m.label}</p>
        {m.tight && <AlertTriangle size={15} className="shrink-0 text-amber-400" />}
      </div>

      <p
        className={`text-lg font-bold tabular-nums ${
          m.projectedBalance < 0 ? "text-rose-400" : "text-emerald-400"
        }`}
      >
        {money(m.projectedBalance)}
      </p>
      <p className="mb-3 text-xs text-gray-500">proyección tras compromisos</p>

      <Progress
        value={maxCommitted > 0 ? (m.totalCommitted / maxCommitted) * 100 : 0}
        tone={m.tight ? "amber" : "indigo"}
      />

      <div className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between text-gray-500">
          <span>Ingresos</span>
          <span className="tabular-nums text-gray-400">{money(m.estimatedIncome)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Gastos fijos</span>
          <span className="tabular-nums text-gray-400">− {money(m.fixedExpenses)}</span>
        </div>
        {m.fundContributions > 0 && (
          <div className="flex justify-between text-gray-500">
            <span>Aportación a fondos</span>
            <span className="tabular-nums text-gray-400">− {money(m.fundContributions)}</span>
          </div>
        )}
        {m.eventsTotal > 0 && (
          <div className="flex justify-between text-gray-500">
            <span>Eventos del mes</span>
            <span className="tabular-nums text-amber-400">− {money(m.eventsTotal)}</span>
          </div>
        )}
      </div>

      {m.events.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-800 pt-3">
          {m.events.map((e) => (
            <div key={e.id} className="text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-gray-300">{e.name}</span>
                <span className="shrink-0 tabular-nums text-gray-400">
                  {money(e.budgetAmount)}
                </span>
              </div>
              <p className="text-gray-600">
                {new Date(e.date).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                {" · "}
                {PLANNED_EVENT_TYPE_LABELS[e.type as PlannedEventType] ?? e.type}
                {e.remaining > 0 ? (
                  <span className="text-amber-500"> · faltan {money(e.remaining)}</span>
                ) : (
                  <span className="text-emerald-500"> · cubierto</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<AnnualCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { money } = useProfile();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.calendar(year, month));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el calendario");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() + i);
  const maxCommitted = Math.max(...(data?.months.map((m) => m.totalCommitted) ?? [1]), 1);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendario financiero</h1>
          <p className="text-sm text-gray-500">
            Doce meses de compromisos conocidos frente a tus ingresos estimados
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="w-auto"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>Desde {m}</option>
            ))}
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
          {data.summary.tightMonths.length > 0 && (
            <p className="rounded-lg bg-amber-950/50 px-3 py-2 text-sm text-amber-300 ring-1 ring-amber-900">
              {data.summary.tightMonths.length === 1
                ? `${data.summary.tightMonths[0]} concentra más compromisos de lo que ingresas ese mes.`
                : `Estos meses concentran más compromisos de lo que ingresas: ${data.summary.tightMonths.join(", ")}.`}{" "}
              Adelantar provisiones en los meses holgados es lo que evita el apuro.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Coste anual de eventos"
              value={money(data.summary.annualEventCost)}
              sub={`${money(data.summary.alreadyReserved)} ya reservado`}
            />
            <Stat
              label="Falta por reservar"
              value={money(data.summary.annualEventRemaining)}
              tone={data.summary.annualEventRemaining > 0 ? "warn" : "good"}
            />
            <Stat
              label="Reserva mensual plana"
              value={money(data.summary.flatMonthlyReserve)}
              sub="repartido a 12 meses"
            />
            <Stat
              label="Provisión real de este mes"
              value={money(data.summary.deadlineAwareMonthlyProvision)}
              sub="respetando cada fecha"
            />
          </div>

          <Card title="Las dos cifras de reserva no son lo mismo">
            <p className="text-sm leading-relaxed text-gray-400">
              La <span className="text-gray-200">reserva plana</span> es lo que tocaría apartar si
              repartieras {money(data.summary.annualEventRemaining)} a partes iguales durante doce
              meses: {money(data.summary.flatMonthlyReserve)} al mes. La{" "}
              <span className="text-gray-200">provisión real</span> es{" "}
              {money(data.summary.deadlineAwareMonthlyProvision)}, y suele ser mayor porque un
              evento que ocurre en dos meses no tiene doce meses para financiarse. Usa la plana para
              hacerte una idea del esfuerzo anual, y la real para saber qué apartar este mes.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-800 pt-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Gastos fijos al año</p>
                <p className="text-base font-semibold text-white">
                  {money(data.summary.annualFixedCost)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Ingresos estimados al año
                </p>
                <p className="text-base font-semibold text-white">
                  {money(data.summary.annualEstimatedIncome)}
                </p>
                <p className="text-xs text-gray-600">
                  criterio prudente en los ingresos variables
                </p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.months.map((m) => (
              <MonthCard
                key={`${m.year}-${m.month}`}
                m={m}
                money={money}
                maxCommitted={maxCommitted}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
