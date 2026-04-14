import type { Alert } from "@/lib/api";

interface Props {
  alert: Alert;
  catColor?: string;
  onEdit: (alert: Alert) => void;
  onDelete: (id: string) => void;
}

export default function BudgetCard({ alert, catColor, onEdit, onDelete }: Props) {
  const pct = Math.min(alert.percentage ?? 0, 100);
  const barColor =
    pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-emerald-500";
  const textColor =
    pct >= 100 ? "text-red-400" : pct >= 80 ? "text-yellow-400" : "text-emerald-400";
  const color = catColor ?? "#64748b";

  return (
    <div className="rounded-xl bg-gray-900 p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold text-white">{alert.category}</span>
          </div>
          <span className="text-xs text-gray-500 capitalize">{alert.period === "monthly" ? "Mensual" : "Semanal"}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(alert)} className="text-xs text-gray-500 transition hover:text-indigo-400">
            Editar
          </button>
          <button onClick={() => onDelete(alert.id)} className="text-xs text-gray-500 transition hover:text-red-400">
            ✕
          </button>
        </div>
      </div>

      <div className="mb-1 flex items-end justify-between text-sm">
        <span className="text-gray-400">
          ${(alert.currentSpend ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          <span className="text-gray-600"> / ${alert.limitAmount.toLocaleString("es-MX")}</span>
        </span>
        <span className={`font-semibold ${textColor}`}>{Math.round(alert.percentage ?? 0)}%</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
