import type { Transaction } from "@/lib/api";
import CategoryBadge from "./CategoryBadge";

interface Props {
  tx: Transaction;
  onDelete?: (id: number) => void;
}

export default function TransactionRow({ tx, onDelete }: Props) {
  const date = new Date(tx.date);
  const formatted = date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40">
      <td className="py-3 pr-4 text-sm text-gray-300">{formatted}</td>
      <td className="py-3 pr-4 text-sm font-medium text-white">{tx.merchant}</td>
      <td className="py-3 pr-4">
        <CategoryBadge name={tx.category.name} color={tx.category.color} />
      </td>
      <td className="py-3 pr-4 text-sm text-gray-400">{tx.last4 ? `••••${tx.last4}` : "—"}</td>
      <td className="py-3 text-right text-sm font-semibold text-white">
        ${tx.amount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
      </td>
      {onDelete && (
        <td className="py-3 pl-4 text-right">
          <button
            onClick={() => onDelete(tx.id)}
            className="text-xs text-gray-500 transition hover:text-red-400"
            title="Eliminar"
          >
            ✕
          </button>
        </td>
      )}
    </tr>
  );
}
