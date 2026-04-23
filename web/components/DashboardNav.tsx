"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearToken } from "@/lib/auth";
import { LayoutDashboard, ArrowLeftRight, Target, Tag, KeyRound, LogOut } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/dashboard/transactions", label: "Movimientos", Icon: ArrowLeftRight },
  { href: "/dashboard/budgets", label: "Presupuestos", Icon: Target },
  { href: "/dashboard/categories", label: "Categorías", Icon: Tag },
  { href: "/dashboard/tokens", label: "API Tokens", Icon: KeyRound },
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
          {navItems.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                isActive(href)
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white cursor-pointer"
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-gray-800 bg-gray-900 px-1 py-2">
        {navItems.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              isActive(href) ? "text-indigo-400" : "text-gray-500"
            }`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
        <button
          onClick={logout}
          className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors cursor-pointer"
        >
          <LogOut size={20} />
          <span>Salir</span>
        </button>
      </nav>
    </>
  );
}
