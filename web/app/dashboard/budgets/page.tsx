"use client";

import { useEffect, useState, useCallback } from "react";
import { alerts, categories, userApi, type Alert, type Category, type UserProfile } from "@/lib/api";
import BudgetCard from "@/components/BudgetCard";

function TotalBudgetBanner({
  profile,
  allocated,
  onUpdate,
}: {
  profile: UserProfile;
  allocated: number;
  onUpdate: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(profile.totalBudget ?? ""));
  const [saving, setSaving] = useState(false);

  const total = profile.totalBudget;
  const remaining = total != null ? total - allocated : null;
  const pct = total && total > 0 ? Math.min((allocated / total) * 100, 100) : 0;
  const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-indigo-500";

  async function save() {
    setSaving(true);
    try {
      const num = value.trim() === "" ? null : parseFloat(value);
      await userApi.setTotalBudget(num);
      onUpdate(num);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-300">Presupuesto total</span>
        {!editing ? (
          <button
            onClick={() => { setValue(String(profile.totalBudget ?? "")); setEditing(true); }}
            className="text-xs text-gray-500 hover:text-indigo-400 transition"
          >
            {total != null ? "Editar" : "Establecer"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-28 rounded-lg bg-gray-800 px-2 py-1 text-sm text-white outline-none ring-1 ring-indigo-500"
              placeholder="0.00"
              autoFocus
            />
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? "…" : "Guardar"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-gray-500 hover:text-white"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {total != null ? (
        <>
          <div className="mb-2 flex items-end justify-between text-sm">
            <span className="text-gray-400">
              Asignado:{" "}
              <span className="font-semibold text-white">
                ${allocated.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-gray-600">
                {" "}/ ${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </span>
            <span className={`text-xs font-semibold ${remaining != null && remaining < 0 ? "text-red-400" : "text-emerald-400"}`}>
              {remaining != null && remaining >= 0
                ? `$${remaining.toLocaleString("es-MX", { minimumFractionDigits: 2 })} disponible`
                : `$${Math.abs(remaining ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} excedido`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500">
          Establece un presupuesto total y distribuye entre categorías.
        </p>
      )}
    </div>
  );
}

function BudgetModal({
  cats,
  editing,
  remaining,
  onClose,
  onSave,
}: {
  cats: Category[];
  editing: Alert | null;
  remaining: number | null;
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
    const num = parseFloat(limitAmount);
    if (remaining != null && !editing && num > remaining) {
      setError(`Excede el presupuesto disponible ($${remaining.toLocaleString("es-MX", { minimumFractionDigits: 2 })})`);
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        await alerts.update(editing.id, { limitAmount: num, period });
      } else {
        await alerts.create({ category, limitAmount: num, period });
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

          {remaining != null && !editing && (
            <div className="rounded-lg bg-indigo-900/30 px-4 py-2 text-xs text-indigo-300">
              Disponible: ${remaining.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Alert | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [al, cl, pr] = await Promise.all([alerts.list(), categories.list(), userApi.me()]);
      setAlertList(al);
      setCats(cl);
      setProfile(pr);
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

  const allocated = alertList.reduce((s, a) => s + a.limitAmount, 0);
  const remaining = profile?.totalBudget != null ? profile.totalBudget - allocated : null;
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

      {profile && (
        <TotalBudgetBanner
          profile={profile}
          allocated={allocated}
          onUpdate={(v) => setProfile((p) => p ? { ...p, totalBudget: v } : p)}
        />
      )}

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
          remaining={remaining}
          onClose={() => setShowModal(false)}
          onSave={load}
        />
      )}
    </div>
  );
}
