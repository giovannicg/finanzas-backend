"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearToken } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/dashboard/transactions", label: "Movimientos", icon: "⇄" },
  { href: "/dashboard/budgets", label: "Presupuestos", icon: "◎" },
  { href: "/dashboard/categories", label: "Categorías", icon: "⊞" },
];

export default function DashboardNav() {
  const pathname = usePathname();

  function logout() {
    clearToken();
    window.location.href = "/login";
  }

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-900">
        <div className="px-6 py-5">
          <span className="text-xl font-bold text-white">Finanzas</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <span>⎋</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-gray-800 bg-gray-900 px-1 py-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              isActive(item.href) ? "text-indigo-400" : "text-gray-500"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="hidden xs:block">{item.label}</span>
          </Link>
        ))}
        <button
          onClick={logout}
          className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-xs font-medium text-gray-500 transition-colors"
        >
          <span className="text-lg leading-none">⎋</span>
          <span className="hidden xs:block">Salir</span>
        </button>
      </nav>
    </>
  );
}
