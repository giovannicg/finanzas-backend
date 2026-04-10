"use client";

import { useEffect, useState, useCallback } from "react";
import { alerts, categories, type Alert, type Category } from "@/lib/api";
import BudgetCard from "@/components/BudgetCard";

function BudgetModal({
  cats,
  editing,
  onClose,
  onSave,
}: {
  cats: Category[];
  editing: Alert | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [category, setCategory] = useState(editing?.category ?? cats[0]?.name ?? "");
  const [limitAmount, setLimitAmount] = useState(String(editing?.limitAmount ?? ""));
  const [period, setPeriod] = useState<"monthly" | "weekly">(editing?.period ?? "monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (editing) {
        await alerts.update(editing.id, { limitAmount: parseFloat(limitAmount), period });
      } else {
        await alerts.create({ category, limitAmount: parseFloat(limitAmount), period });
      }
      onSave();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {editing ? "Editar presupuesto" : "Nuevo presupuesto"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</div>
          )}

          {!editing && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              >
                {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Límite ($)</label>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              value={limitAmount}
              onChange={(e) => setLimitAmount(e.target.value)}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Periodo</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as "monthly" | "weekly")}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
            >
              <option value="monthly">Mensual</option>
              <option value="weekly">Semanal</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-gray-800 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BudgetsPage() {
  const [alertList, setAlertList] = useState<Alert[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Alert | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [al, cl] = await Promise.all([alerts.list(), categories.list()]);
      setAlertList(al);
      setCats(cl);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este presupuesto?")) return;
    await alerts.remove(id);
    load();
  }

  function handleEdit(alert: Alert) {
    setEditing(alert);
    setShowModal(true);
  }

  const triggered = alertList.filter((a) => (a.percentage ?? 0) >= 80).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Presupuestos</h1>
          {triggered > 0 && (
            <p className="mt-1 text-sm text-yellow-400">{triggered} presupuesto(s) en alerta</p>
          )}
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nuevo presupuesto
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Cargando…</div>
      ) : alertList.length === 0 ? (
        <div className="rounded-xl bg-gray-900 py-16 text-center text-sm text-gray-500">
          Sin presupuestos configurados
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {alertList.map((a) => (
            <BudgetCard key={a.id} alert={a} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showModal && cats.length > 0 && (
        <BudgetModal
          cats={cats}
          editing={editing}
          onClose={() => setShowModal(false)}
          onSave={load}
        />
      )}
    </div>
  );
}
