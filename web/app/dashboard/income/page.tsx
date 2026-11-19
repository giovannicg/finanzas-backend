"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  incomes as incomesApi,
  INCOME_TYPE_LABELS,
  type Income,
  type IncomeType,
} from "@/lib/api";
import { useProfile } from "@/lib/useProfile";
import { Card, Stat, Field, Input, Select, Button, ErrorNote, Empty } from "@/components/ui";

const TODAY = () => new Date().toISOString().slice(0, 10);

export default function IncomePage() {
  const [items, setItems] = useState<Income[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { money } = useProfile();

  const [name, setName] = useState("");
  const [type, setType] = useState<IncomeType>("SALARY");
  const [amount, setAmount] = useState("");
  const [isVariable, setIsVariable] = useState(false);
  const [conservative, setConservative] = useState("");
  const [frequency, setFrequency] = useState<"MONTHLY" | "ONE_TIME">("MONTHLY");
  const [receivedOn, setReceivedOn] = useState(TODAY());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await incomesApi.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los ingresos");
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
      await incomesApi.create({
        name,
        type,
        amount: parseFloat(amount),
        isVariable,
        conservativeAmount: isVariable && conservative ? parseFloat(conservative) : null,
        frequency,
        receivedOn: frequency === "ONE_TIME" ? receivedOn : null,
      });
      setName("");
      setAmount("");
      setConservative("");
      setIsVariable(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el ingreso");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(income: Income) {
    try {
      await incomesApi.update(income.id, { active: !income.active });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  }

  async function remove(income: Income) {
    try {
      await incomesApi.remove(income.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  // El total de planificación usa el importe prudente de los ingresos variables.
  const monthlyTotal = items
    .filter((i) => i.active && i.frequency === "MONTHLY")
    .reduce((sum, i) => sum + i.planningAmount, 0);

  const hasVariable = items.some((i) => i.active && i.isVariable);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Ingresos</h1>
        <p className="text-sm text-gray-500">
          Si un ingreso es variable, el plan usa tu estimación prudente, no el mejor mes
        </p>
      </div>

      <ErrorNote message={error} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          label="Ingreso mensual de planificación"
          value={money(monthlyTotal)}
          sub={hasVariable ? "con estimación prudente" : undefined}
        />
        <Stat label="Fuentes activas" value={String(items.filter((i) => i.active).length)} />
      </div>

      <Card title="Añadir un ingreso">
        <form onSubmit={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nómina, clases particulares…"
              required
            />
          </Field>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as IncomeType)}>
              {(Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map((t) => (
                <option key={t} value={t}>{INCOME_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Frecuencia">
            <Select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as "MONTHLY" | "ONE_TIME")}
            >
              <option value="MONTHLY">Cada mes</option>
              <option value="ONE_TIME">Una sola vez</option>
            </Select>
          </Field>
          <Field label="Importe habitual">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>

          {frequency === "ONE_TIME" ? (
            <Field label="Fecha en que lo recibes">
              <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
            </Field>
          ) : (
            <Field label="¿El importe varía?" hint="Marca si cobras distinto cada mes">
              <div className="flex h-[38px] items-center gap-2">
                <input
                  type="checkbox"
                  checked={isVariable}
                  onChange={(e) => setIsVariable(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-indigo-500"
                />
                <span className="text-sm text-gray-300">Ingreso variable</span>
              </div>
            </Field>
          )}

          {isVariable && frequency === "MONTHLY" && (
            <Field
              label="Estimación prudente"
              hint="El mínimo con el que puedes contar. Es lo que usará el plan."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={conservative}
                onChange={(e) => setConservative(e.target.value)}
                placeholder="p. ej. tu peor mes"
              />
            </Field>
          )}

          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Añadir ingreso"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Tus ingresos">
        {loading ? (
          <Empty message="Cargando…" />
        ) : items.length === 0 ? (
          <Empty message="Todavía no has registrado ningún ingreso." />
        ) : (
          <div className="divide-y divide-gray-800">
            {items.map((income) => (
              <div key={income.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-medium ${income.active ? "text-white" : "text-gray-500 line-through"}`}>
                    {income.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {INCOME_TYPE_LABELS[income.type]}
                    {" · "}
                    {income.frequency === "MONTHLY" ? "cada mes" : "una sola vez"}
                    {income.isVariable && " · variable"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm tabular-nums text-gray-200">{money(income.planningAmount)}</p>
                    {income.isVariable && income.conservativeAmount != null && (
                      <p className="text-xs text-gray-500">habitual {money(income.amount)}</p>
                    )}
                  </div>
                  <Button variant="ghost" onClick={() => toggle(income)} className="px-2 py-1 text-xs">
                    {income.active ? "Pausar" : "Activar"}
                  </Button>
                  <button
                    onClick={() => remove(income)}
                    aria-label={`Eliminar ${income.name}`}
                    className="cursor-pointer text-gray-600 transition-colors hover:text-rose-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
