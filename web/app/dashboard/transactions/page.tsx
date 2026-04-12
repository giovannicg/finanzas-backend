"use client";

import { useEffect, useState, useCallback } from "react";
import { transactions, categories, type Transaction, type Category } from "@/lib/api";
import TransactionRow from "@/components/TransactionRow";

function Modal({
  cats,
  editing,
  onClose,
  onSave,
}: {
  cats: Category[];
  editing?: Transaction;
  onClose: () => void;
  onSave: () => void;
}) {
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [merchant, setMerchant] = useState(editing?.merchant ?? "");
  const [categoryId, setCategoryId] = useState(() => {
    if (editing) {
      // The API returns category as a string name at runtime
      const catName = typeof editing.category === "string"
        ? editing.category
        : (editing.category as { name: string }).name;
      return cats.find((c) => c.name === catName)?.id ?? cats[0]?.id ?? 0;
    }
    return cats[0]?.id ?? 0;
  });
  const [last4, setLast4] = useState(editing?.last4 ?? "");
  const [date, setDate] = useState(
    editing ? editing.date.split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const selectedCat = cats.find((c) => c.id === categoryId);
      const categoryName = selectedCat?.name ?? "";
      if (editing) {
        await transactions.update(editing.id, {
          amount: parseFloat(amount),
          merchant,
          category: categoryName,
          cardLast4: last4 || undefined,
          date,
        });
      } else {
        await transactions.create({
          amount: parseFloat(amount),
          merchant,
          categoryId,
          last4: last4 || undefined,
          date,
        });
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
      <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {editing ? "Editar transacción" : "Nueva transacción"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Monto ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Últimos 4 dígitos</label>
              <input
                type="text"
                maxLength={4}
                pattern="[0-9]{3,4}"
                value={last4}
                onChange={(e) => setLast4(e.target.value)}
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
                placeholder="1234"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Comercio</label>
            <input
              type="text"
              required
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              placeholder="Nombre del comercio"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Categoría</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Fecha</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              />
            </div>
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

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | undefined>(undefined);
  const [filterCat, setFilterCat] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterCat) params.categoryId = filterCat;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const [list, catList] = await Promise.all([
        transactions.list(params),
        categories.list(),
      ]);
      setTxs(list);
      setCats(catList);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterCat, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar esta transacción?")) return;
    await transactions.remove(id);
    load();
  }

  function handleEdit(tx: Transaction) {
    setEditingTx(tx);
    setShowModal(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Movimientos</h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 sm:px-4"
        >
          <span className="sm:hidden">+ Nueva</span>
          <span className="hidden sm:inline">+ Nueva transacción</span>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 rounded-xl bg-gray-900 p-4 sm:flex sm:flex-wrap sm:gap-3">
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 sm:w-auto sm:py-1.5"
        >
          <option value="">Todas las categorías</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 sm:w-auto sm:py-1.5"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 sm:w-auto sm:py-1.5"
          />
        </div>
        {(filterCat || filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterCat(""); setFilterFrom(""); setFilterTo(""); }}
            className="rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-400 transition hover:text-white sm:py-1.5"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-gray-900 p-5">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">Cargando…</div>
        ) : txs.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">Sin transacciones</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-gray-800">
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Fecha</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Comercio</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Categoría</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Tarjeta</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Monto</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onEdit={handleEdit} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && cats.length > 0 && (
        <Modal
          cats={cats}
          editing={editingTx}
          onClose={() => { setShowModal(false); setEditingTx(undefined); }}
          onSave={load}
        />
      )}
    </div>
  );
}
