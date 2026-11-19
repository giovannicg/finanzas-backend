"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { fixedExpenses as api, type FixedExpense, type FixedExpenseList } from "@/lib/api";
import { useProfile } from "@/lib/useProfile";
import { Card, Stat, Field, Input, Select, Button, ErrorNote, Empty } from "@/components/ui";

/** Categorías sugeridas para los compromisos mensuales del plan financiero. */
const CATEGORIES = [
  "Vivienda",
  "Salud",
  "Servicios",
  "Alimentación",
  "Transporte",
  "Suscripciones",
  "Comunicaciones",
  "Otros",
];

export default function FixedExpensesPage() {
  const [data, setData] = useState<FixedExpenseList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { money } = useProfile();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Vivienda");
  const [amount, setAmount] = useState("");
  const [isVariableAmount, setIsVariableAmount] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los gastos fijos");
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
        category,
        amount: parseFloat(amount),
        isVariableAmount,
        dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : null,
      });
      setName("");
      setAmount("");
      setDayOfMonth("");
      setIsVariableAmount(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el gasto");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(expense: FixedExpense) {
    try {
      await api.update(expense.id, { active: !expense.active });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  }

  async function remove(expense: FixedExpense) {
    try {
      await api.remove(expense.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Gastos fijos mensuales</h1>
        <p className="text-sm text-gray-500">
          Lo que pagas cada mes. Marca los que varían de importe, como la luz o el supermercado
        </p>
      </div>

      <ErrorNote message={error} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Total mensual" value={money(data?.total ?? 0)} />
        <Stat
          label="De importe fijo"
          value={money(data?.fixedAmountTotal ?? 0)}
          sub="siempre lo mismo"
        />
        <Stat
          label="Necesarios pero variables"
          value={money(data?.estimatedAmountTotal ?? 0)}
          sub="solo una estimación"
        />
      </div>

      <Card title="Añadir un gasto fijo">
        <form onSubmit={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alquiler, Netflix, luz…"
              required
            />
          </Field>
          <Field label="Categoría">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Importe mensual">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Día de cobro" hint="Opcional">
            <Input
              type="number"
              min="1"
              max="31"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              placeholder="1-31"
            />
          </Field>
          <Field label="¿El importe varía?" hint="Luz, agua, supermercado…">
            <div className="flex h-[38px] items-center gap-2">
              <input
                type="checkbox"
                checked={isVariableAmount}
                onChange={(e) => setIsVariableAmount(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-indigo-500"
              />
              <span className="text-sm text-gray-300">Es una estimación</span>
            </div>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Añadir gasto"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Tus compromisos mensuales">
        {loading ? (
          <Empty message="Cargando…" />
        ) : !data || data.expenses.length === 0 ? (
          <Empty message="Todavía no has registrado ningún gasto fijo." />
        ) : (
          <div className="divide-y divide-gray-800">
            {data.expenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-medium ${expense.active ? "text-white" : "text-gray-500 line-through"}`}>
                    {expense.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {expense.category}
                    {expense.dayOfMonth ? ` · día ${expense.dayOfMonth}` : ""}
                    {expense.isVariableAmount && " · importe variable"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm tabular-nums text-gray-200">
                    {expense.isVariableAmount && "≈ "}
                    {money(expense.amount)}
                  </p>
                  <Button variant="ghost" onClick={() => toggle(expense)} className="px-2 py-1 text-xs">
                    {expense.active ? "Pausar" : "Activar"}
                  </Button>
                  <button
                    onClick={() => remove(expense)}
                    aria-label={`Eliminar ${expense.name}`}
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
