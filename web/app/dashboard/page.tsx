"use client";

import { useEffect, useState, useCallback } from "react";
import { transactions, type TransactionSummary, type Transaction } from "@/lib/api";
import TransactionRow from "@/components/TransactionRow";
import SpendingDonut from "@/components/SpendingDonut";
import MonthlyBarChart from "@/components/MonthlyBarChart";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-gray-900 p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed

  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year: String(year), month: String(month) };
      const [sum, txs] = await Promise.all([
        transactions.summary(params),
        transactions.list({ ...params, limit: "10" }),
      ]);
      setSummary(sum);
      setRecent(txs.transactions);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-white outline-none ring-1 ring-gray-700"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-white outline-none ring-1 ring-gray-700"
          >
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Gasto total"
          value={`$${(summary?.totalSpent ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
          sub={`${MONTHS[month - 1]} ${year}`}
        />
        <KPICard
          label="Transacciones"
          value={String(summary?.transactionCount ?? 0)}
        />
        <KPICard
          label="Categoría top"
          value={summary?.topCategory ?? "—"}
        />
        <KPICard
          label="Presupuestos en alerta"
          value={String(summary?.alertsTriggered ?? 0)}
          sub="≥ 80% del límite"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-gray-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-300">Gasto por categoría</h2>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-gray-500">Cargando…</div>
          ) : (
            <SpendingDonut data={summary?.byCategory ?? []} />
          )}
        </div>
        <div className="rounded-xl bg-gray-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-300">Gasto mensual (6 meses)</h2>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-gray-500">Cargando…</div>
          ) : (
            <MonthlyBarChart data={summary?.monthly ?? []} />
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl bg-gray-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-300">Últimas transacciones</h2>
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Cargando…</div>
        ) : recent.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">Sin transacciones este mes</div>
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
                </tr>
              </thead>
              <tbody>
                {recent.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    catColor={summary?.byCategory.find((c) => c.category === tx.category)?.color}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
