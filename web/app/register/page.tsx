"use client";

import { useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/api";
import { saveToken } from "@/lib/auth";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await auth.register(name, email, password);
      saveToken(res.token);
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrarse");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-3xl font-bold text-white">Finanzas</h1>
        <p className="mb-8 text-center text-sm text-gray-400">Crea tu cuenta</p>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-gray-900 p-6 shadow-xl">
          {error && (
            <div className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Nombre</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              placeholder="Tu nombre"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Contraseña</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Cargando..." : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
