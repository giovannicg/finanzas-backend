import type { Transaction } from "@/lib/api";
import CategoryBadge from "./CategoryBadge";

interface Props {
  tx: Transaction;
  onEdit?: (tx: Transaction) => void;
  onDelete?: (id: string) => void;
}

export default function TransactionRow({ tx, onEdit, onDelete }: Props) {
  const date = new Date(tx.date);
  const formatted = date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const CATEGORY_COLORS: Record<string, string> = {
    Comida: "#f97316", Transporte: "#3b82f6", Entretenimiento: "#a855f7",
    Salud: "#22c55e", Supermercado: "#eab308", Compras: "#ec4899",
    Servicios: "#06b6d4", Educación: "#f43f5e", Viajes: "#14b8a6", Otros: "#64748b",
  };
  const catName = typeof tx.category === "string" ? tx.category : (tx.category as unknown as { name: string })?.name;
  const catColor = CATEGORY_COLORS[catName ?? ""] ?? "#64748b";
  const amountStr = `$${tx.amount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  return (
    <>
      {/* Mobile card row */}
      <tr className="sm:hidden border-b border-gray-800">
        <td colSpan={99} className="py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{tx.merchant}</p>
              <p className="mt-0.5 text-xs text-gray-400">{formatted}</p>
              {catName && (
                <div className="mt-1.5">
                  <CategoryBadge name={catName} color={catColor ?? "#64748b"} />
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-semibold text-white">{amountStr}</span>
              {onEdit && (
                <button
                  onClick={() => onEdit(tx)}
                  className="text-base text-gray-500 transition hover:text-indigo-400"
                  title="Editar"
                >
                  ✎
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(tx.id)}
                  className="text-sm text-gray-500 transition hover:text-red-400"
                  title="Eliminar"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Desktop table row */}
      <tr className="hidden sm:table-row border-b border-gray-800 hover:bg-gray-800/40">
        <td className="py-3 pr-4 text-sm text-gray-300">{formatted}</td>
        <td className="py-3 pr-4 text-sm font-medium text-white">{tx.merchant}</td>
        <td className="py-3 pr-4">
          {catName && <CategoryBadge name={catName} color={catColor ?? "#64748b"} />}
        </td>
        <td className="py-3 pr-4 text-sm text-gray-400">{tx.cardLast4 ? `••••${tx.cardLast4}` : "—"}</td>
        <td className="py-3 text-right text-sm font-semibold text-white">{amountStr}</td>
        <td className="py-3 pl-4 text-right">
          <div className="flex items-center justify-end gap-3">
            {onEdit && (
              <button
                onClick={() => onEdit(tx)}
                className="text-xs text-gray-500 transition hover:text-indigo-400"
                title="Editar"
              >
                ✎
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(tx.id)}
                className="text-xs text-gray-500 transition hover:text-red-400"
                title="Eliminar"
              >
                ✕
              </button>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}
