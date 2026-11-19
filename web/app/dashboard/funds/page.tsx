"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import {
  funds as api,
  FUND_TYPE_LABELS,
  type Fund,
  type FundMovement,
  type FundType,
} from "@/lib/api";
import { useProfile } from "@/lib/useProfile";
import { Card, Stat, Field, Input, Select, Button, ErrorNote, Empty, Progress } from "@/components/ui";

/** Tarjeta de un fondo: saldo, objetivo y aportaciones/retiradas. */
function FundCard({
  fund,
  money,
  onMove,
  onRemove,
  onSetContribution,
}: {
  fund: Fund;
  money: (n: number) => string;
  onMove: (id: string, amount: number, type: "DEPOSIT" | "WITHDRAWAL", note: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSetContribution: (id: string, value: number | null) => Promise<void>;
}) {
  const [mode, setMode] = useState<"none" | "DEPOSIT" | "WITHDRAWAL">("none");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<FundMovement[] | null>(null);
  const [contribution, setContribution] = useState(String(fund.monthlyContribution ?? ""));

  async function submit() {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0 || mode === "none") return;
    setBusy(true);
    try {
      await onMove(fund.id, value, mode, note);
      setMode("none");
      setAmount("");
      setNote("");
      if (history) setHistory(await api.movements(fund.id));
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory() {
    if (history) { setHistory(null); return; }
    setHistory(await api.movements(fund.id));
  }

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{fund.name}</p>
          <p className="text-xs text-gray-500">{FUND_TYPE_LABELS[fund.type]}</p>
        </div>
        <button
          onClick={() => onRemove(fund.id)}
          aria-label={`Eliminar ${fund.name}`}
          className="cursor-pointer text-gray-600 transition-colors hover:text-rose-400"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <p className="text-2xl font-bold tabular-nums text-white">{money(fund.balance)}</p>
      {fund.targetAmount != null && (
        <>
          <p className="mb-2 text-xs text-gray-500">
            objetivo {money(fund.targetAmount)}
            {fund.targetDate &&
              ` · para ${new Date(fund.targetDate).toLocaleDateString("es", { month: "long", year: "numeric" })}`}
          </p>
          <Progress value={fund.progress ?? 0} tone="emerald" />
        </>
      )}

      {fund.allocatedToEvents > 0 && (
        <p className={`mt-2 text-xs ${fund.overAllocated ? "text-rose-400" : "text-gray-500"}`}>
          {money(fund.allocatedToEvents)} etiquetados para eventos · {money(fund.unallocated)} libres dentro del fondo
        </p>
      )}

      {fund.fundedByEventProvisions && (
        <p className="mt-2 rounded-lg bg-gray-800/60 px-2 py-1.5 text-xs text-gray-400">
          Se alimenta de las provisiones de tus eventos, así que su aportación no se suma otra vez al plan.
        </p>
      )}

      {fund.suggestedMonthlyContribution != null && (
        <p className="mt-2 text-xs text-indigo-400">
          Aportación recomendada: {money(fund.suggestedMonthlyContribution)}/mes
        </p>
      )}

      <div className="mt-4 flex items-end gap-2">
        <Field label="Aportación mensual">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Button
          variant="ghost"
          onClick={() => onSetContribution(fund.id, contribution ? parseFloat(contribution) : null)}
          className="px-3 py-2 text-xs"
        >
          Guardar
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => setMode(mode === "DEPOSIT" ? "none" : "DEPOSIT")} className="px-3 py-1.5 text-xs">
          <ArrowDownLeft size={13} className="mr-1 inline" /> Aportar
        </Button>
        <Button variant="ghost" onClick={() => setMode(mode === "WITHDRAWAL" ? "none" : "WITHDRAWAL")} className="px-3 py-1.5 text-xs">
          <ArrowUpRight size={13} className="mr-1 inline" /> Retirar
        </Button>
        <Button variant="ghost" onClick={toggleHistory} className="px-3 py-1.5 text-xs">
          {history ? "Ocultar" : "Movimientos"}
        </Button>
      </div>

      {mode !== "none" && (
        <div className="mt-3 space-y-2 rounded-lg bg-gray-800/60 p-3">
          <Field
            label={mode === "DEPOSIT" ? "Cuánto aportas" : "Cuánto retiras"}
            hint="Mover dinero a un fondo no es gastarlo"
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Nota" hint="Opcional">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Aportación de noviembre" />
          </Field>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy} className="px-3 py-1.5 text-xs">
              {busy ? "Guardando…" : "Confirmar"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} className="px-3 py-1.5 text-xs">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {history && (
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-gray-800/40 p-2">
          {history.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-500">Sin movimientos.</p>
          ) : (
            history.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-gray-400">
                  {new Date(m.date).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
                <span className={`shrink-0 tabular-nums ${m.type === "DEPOSIT" ? "text-emerald-400" : "text-amber-400"}`}>
                  {m.type === "DEPOSIT" ? "+" : "−"}
                  {money(m.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

export default function FundsPage() {
  const [items, setItems] = useState<Fund[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { money } = useProfile();

  const [name, setName] = useState("");
  const [type, setType] = useState<FundType>("EMERGENCY");
  const [targetAmount, setTargetAmount] = useState("");
  const [balance, setBalance] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.list();
      setItems(result.funds);
      setTotalBalance(result.totalBalance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los fondos");
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
        targetAmount: targetAmount ? parseFloat(targetAmount) : null,
        balance: balance ? parseFloat(balance) : 0,
        targetDate: targetDate || null,
        monthlyContribution: monthlyContribution ? parseFloat(monthlyContribution) : null,
      });
      setName("");
      setTargetAmount("");
      setBalance("");
      setTargetDate("");
      setMonthlyContribution("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el fondo");
    } finally {
      setSaving(false);
    }
  }

  async function move(id: string, amount: number, movementType: "DEPOSIT" | "WITHDRAWAL", note: string) {
    setError(null);
    try {
      await api.move(id, { amount, type: movementType, note: note || undefined });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el movimiento");
    }
  }

  async function setContribution(id: string, value: number | null) {
    setError(null);
    try {
      await api.update(id, { monthlyContribution: value });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la aportación");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.remove(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el fondo");
    }
  }

  const hasEmergency = items.some((f) => f.type === "EMERGENCY");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Fondos de ahorro</h1>
        <p className="text-sm text-gray-500">
          Dinero reservado, separado por propósito. Aportar a un fondo es una transferencia, no un gasto
        </p>
      </div>

      <ErrorNote message={error} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Total reservado" value={money(totalBalance)} />
        <Stat label="Fondos" value={String(items.length)} />
        <Stat
          label="Fondo de emergencia"
          value={hasEmergency ? "Sí" : "Falta"}
          tone={hasEmergency ? "good" : "warn"}
          sub={hasEmergency ? undefined : "es la primera defensa"}
        />
      </div>

      <Card title="Crear un fondo">
        <form onSubmit={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Emergencias, Navidad…"
              required
            />
          </Field>
          <Field label="Propósito">
            <Select value={type} onChange={(e) => setType(e.target.value as FundType)}>
              {(Object.keys(FUND_TYPE_LABELS) as FundType[]).map((t) => (
                <option key={t} value={t}>{FUND_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Saldo actual" hint="Lo que ya tienes apartado">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Objetivo" hint="Opcional">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Fecha límite" hint="Opcional: calcula la aportación recomendada">
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
          <Field label="Aportación mensual" hint="Opcional">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Creando…" : "Crear fondo"}
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <Empty message="Cargando…" />
      ) : items.length === 0 ? (
        <Card>
          <Empty message="Todavía no has creado ningún fondo." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((fund) => (
            <FundCard
              key={fund.id}
              fund={fund}
              money={money}
              onMove={move}
              onRemove={remove}
              onSetContribution={setContribution}
            />
          ))}
        </div>
      )}
    </div>
  );
}
