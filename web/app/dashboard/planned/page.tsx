"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, PiggyBank, Receipt } from "lucide-react";
import {
  plannedEvents as api,
  funds as fundsApi,
  PLANNED_EVENT_TYPE_LABELS,
  type Fund,
  type PlannedEvent,
  type PlannedEventList,
  type PlannedEventType,
} from "@/lib/api";
import { useProfile } from "@/lib/useProfile";
import { Card, Stat, Field, Input, Select, Button, ErrorNote, Empty, Progress } from "@/components/ui";

const TODAY = () => new Date().toISOString().slice(0, 10);

/** Fila de un evento con sus dos acciones de dinero: reservar y liquidar. */
function EventRow({
  event,
  money,
  onReserve,
  onSettle,
  onRemove,
}: {
  event: PlannedEvent;
  money: (n: number) => string;
  onReserve: (id: string, amount: number) => Promise<void>;
  onSettle: (id: string, amount: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"none" | "reserve" | "settle">("none");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const urgent = event.monthsRemaining === 1 && event.remaining > 0;

  async function submit() {
    const amount = parseFloat(value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    try {
      if (mode === "reserve") await onReserve(event.id, amount);
      else await onSettle(event.id, amount);
      setMode("none");
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-4">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{event.name}</p>
          <p className="text-xs text-gray-500">
            {PLANNED_EVENT_TYPE_LABELS[event.type]}
            {" · "}
            {new Date(event.nextDate).toLocaleDateString("es", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
            {event.yearlyRecurring && " · cada año"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => { setMode(mode === "reserve" ? "none" : "reserve"); setValue(String(event.requiredMonthlySaving || "")); }}
            title="Reservar dinero (transferencia, no gasto)"
            className="cursor-pointer rounded-lg bg-gray-800 p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-indigo-400"
          >
            <PiggyBank size={15} />
          </button>
          <button
            onClick={() => { setMode(mode === "settle" ? "none" : "settle"); setValue(String(event.budgetAmount)); }}
            title="Registrar el pago"
            className="cursor-pointer rounded-lg bg-gray-800 p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-emerald-400"
          >
            <Receipt size={15} />
          </button>
          <button
            onClick={() => onRemove(event.id)}
            aria-label={`Eliminar ${event.name}`}
            className="cursor-pointer p-2 text-gray-600 transition-colors hover:text-rose-400"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <Progress value={event.progress} tone={urgent ? "amber" : "emerald"} />

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>
          Reservado <span className="text-gray-300">{money(event.savedAmount)}</span> de{" "}
          {money(event.budgetAmount)}
        </span>
        <span>
          {event.monthsRemaining} {event.monthsRemaining === 1 ? "mes restante" : "meses restantes"}
        </span>
        {event.requiredMonthlySaving > 0 ? (
          <span className={urgent ? "text-amber-400" : "text-indigo-400"}>
            Aparta {money(event.requiredMonthlySaving)} al mes
          </span>
        ) : (
          <span className="text-emerald-400">Ya está cubierto</span>
        )}
      </div>

      {mode !== "none" && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-gray-800/60 p-3">
          <Field
            label={mode === "reserve" ? "Cuánto apartas" : "Cuánto has pagado"}
            hint={
              mode === "reserve"
                ? "Es una transferencia a tu dinero reservado, no un gasto"
                : "Se consume primero lo ya reservado"
            }
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </Field>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Guardando…" : mode === "reserve" ? "Reservar" : "Registrar pago"}
          </Button>
          <Button variant="ghost" onClick={() => setMode("none")}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}

export default function PlannedEventsPage() {
  const [data, setData] = useState<PlannedEventList | null>(null);
  const [fundList, setFundList] = useState<Fund[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { money } = useProfile();

  const [name, setName] = useState("");
  const [type, setType] = useState<PlannedEventType>("BIRTHDAY");
  const [eventDate, setEventDate] = useState(TODAY());
  const [budgetAmount, setBudgetAmount] = useState("");
  const [savedAmount, setSavedAmount] = useState("");
  const [yearlyRecurring, setYearlyRecurring] = useState(true);
  const [fundId, setFundId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [events, fundsResult] = await Promise.all([api.list(), fundsApi.list()]);
      setData(events);
      setFundList(fundsResult.funds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los eventos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.create({
        name,
        type,
        eventDate,
        yearlyRecurring,
        budgetAmount: parseFloat(budgetAmount),
        savedAmount: savedAmount ? parseFloat(savedAmount) : 0,
        fundId: fundId || null,
      });
      setName("");
      setBudgetAmount("");
      setSavedAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el evento");
    } finally {
      setSaving(false);
    }
  }

  async function reserve(id: string, amount: number) {
    setError(null);
    setNotice(null);
    try {
      await api.reserve(id, amount);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reservar el dinero");
    }
  }

  async function settle(id: string, amount: number) {
    setError(null);
    setNotice(null);
    try {
      const result = await api.settle(id, { amount });
      setNotice(
        result.uncovered > 0
          ? `Pago registrado. ${money(result.consumedFromReserve)} salieron de lo reservado y ${money(result.uncovered)} del presupuesto de este mes.`
          : `Pago registrado. Los ${money(result.consumedFromReserve)} salieron íntegros de lo que habías reservado.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago");
    }
  }

  async function remove(id: string) {
    try {
      await api.remove(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Gastos previsibles</h1>
        <p className="text-sm text-gray-500">
          Cumpleaños, Navidad, seguros anuales, vacaciones. La app calcula cuánto apartar cada mes
        </p>
      </div>

      <ErrorNote message={error} />
      {notice && (
        <p className="rounded-lg bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300 ring-1 ring-emerald-900">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Coste anual previsto" value={money(data?.totalBudget ?? 0)} />
        <Stat label="Ya reservado" value={money(data?.totalSaved ?? 0)} tone="good" />
        <Stat
          label="Provisión mensual"
          value={money(data?.totalMonthlyProvision ?? 0)}
          sub="lo que debes apartar este mes"
        />
        <Stat label="Eventos activos" value={String(data?.events.length ?? 0)} />
      </div>

      <Card title="Añadir un gasto previsible">
        <form onSubmit={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre del evento">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cumpleaños de mamá"
              required
            />
          </Field>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as PlannedEventType)}>
              {(Object.keys(PLANNED_EVENT_TYPE_LABELS) as PlannedEventType[]).map((t) => (
                <option key={t} value={t}>{PLANNED_EVENT_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha estimada">
            <Input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Presupuesto total">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Dinero ya reservado" hint="Opcional, si ya tienes algo apartado">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={savedAmount}
              onChange={(e) => setSavedAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Fondo asociado" hint="Opcional: de dónde sale el dinero reservado">
            <Select value={fundId} onChange={(e) => setFundId(e.target.value)}>
              <option value="">Sin fondo</option>
              {fundList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="¿Se repite cada año?">
            <div className="flex h-[38px] items-center gap-2">
              <input
                type="checkbox"
                checked={yearlyRecurring}
                onChange={(e) => setYearlyRecurring(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-indigo-500"
              />
              <span className="text-sm text-gray-300">Evento anual</span>
            </div>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Añadir evento"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Tu calendario de compromisos">
        {loading ? (
          <Empty message="Cargando…" />
        ) : !data || data.events.length === 0 ? (
          <Empty message="Todavía no has registrado ningún gasto previsible." />
        ) : (
          <div className="divide-y divide-gray-800">
            {data.events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                money={money}
                onReserve={reserve}
                onSettle={settle}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
