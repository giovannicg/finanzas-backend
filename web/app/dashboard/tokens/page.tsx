"use client";

import { useEffect, useState, useCallback } from "react";
import { apiTokens, type ApiToken } from "@/lib/api";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="ml-2 rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
    >
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function NewTokenModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: ApiToken) => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const t = await apiTokens.create(name.trim());
      onCreated(t);
    } catch {
      setError("Error al crear el token");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Nuevo API token</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Nombre del token</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. iPhone Shortcuts"
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-gray-800 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Creando…" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RevealedToken({ token, onClose }: { token: ApiToken; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-2 text-lg font-semibold text-white">Token creado</h2>
        <p className="mb-4 text-sm text-yellow-400">
          Copia este token ahora. No volverá a mostrarse.
        </p>
        <div className="mb-4 flex items-center rounded-lg bg-gray-800 px-3 py-2">
          <code className="flex-1 break-all text-xs text-emerald-400">{token.token}</code>
          <CopyButton text={token.token!} />
        </div>
        <p className="mb-4 text-xs text-gray-500">
          Úsalo en el header <code className="text-gray-300">Authorization: Bearer {"{token}"}</code> o en el campo <code className="text-gray-300">token</code> del webhook SMS.
        </p>
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Entendido, ya lo copié
        </button>
      </div>
    </div>
  );
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [revealed, setRevealed] = useState<ApiToken | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTokens(await apiTokens.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRevoke(id: string) {
    if (!confirm("¿Revocar este token? Dejará de funcionar inmediatamente.")) return;
    await apiTokens.remove(id);
    load();
  }

  function handleCreated(t: ApiToken) {
    setShowModal(false);
    setRevealed(t);
    load();
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API Tokens</h1>
          <p className="mt-1 text-sm text-gray-500">
            Úsalos en iPhone Shortcuts o scripts en lugar de tu contraseña o token de sesión.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          + Nuevo token
        </button>
      </div>

      {/* Instrucciones */}
      <div className="rounded-xl bg-gray-900 p-4 text-sm text-gray-400 space-y-1">
        <p className="font-medium text-gray-300">¿Cómo usarlo?</p>
        <p>En el webhook SMS envía <code className="text-gray-200">{"{ \"token\": \"fin_…\", \"text\": \"…\" }"}</code></p>
        <p>En peticiones HTTP: header <code className="text-gray-200">Authorization: Bearer fin_…</code></p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Cargando…</div>
      ) : tokens.length === 0 ? (
        <div className="rounded-xl bg-gray-900 py-16 text-center text-sm text-gray-500">
          Sin tokens generados
        </div>
      ) : (
        <div className="divide-y divide-gray-800 rounded-xl bg-gray-900">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">{t.name}</p>
                <p className="text-xs text-gray-500">
                  Creado {fmt(t.createdAt)}
                  {t.lastUsedAt ? ` · Último uso ${fmt(t.lastUsedAt)}` : " · Sin usar"}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(t.id)}
                className="rounded-lg bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/70"
              >
                Revocar
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && <NewTokenModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
      {revealed && <RevealedToken token={revealed} onClose={() => setRevealed(null)} />}
    </div>
  );
}
