"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, Trash2, Palette } from "lucide-react";
import { categories, type Category } from "@/lib/api";
import CategoryBadge from "@/components/CategoryBadge";

const PRESET_COLORS = [
  "#fb7185","#f472b6","#fb923c","#facc15","#4ade80",
  "#2dd4bf","#38bdf8","#60a5fa","#a78bfa","#94a3b8",
];

function pickUnusedColor(existingCats: Category[]): string {
  const used = new Set(existingCats.map((c) => c.color.toLowerCase()));
  return PRESET_COLORS.find((c) => !used.has(c.toLowerCase())) ?? PRESET_COLORS[0];
}

function CategoryModal({
  existingCats,
  onClose,
  onSave,
}: {
  existingCats: Category[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => pickUnusedColor(existingCats));
  const [customColor, setCustomColor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeColor = customColor || color;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await categories.create({ name, color: activeColor });
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
          <h2 className="text-lg font-semibold text-white">Nueva categoría</h2>
          <button onClick={onClose} className="cursor-pointer rounded p-1 text-gray-500 transition hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Nombre</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-gray-700 focus:ring-emerald-500"
              placeholder="Mi categoría"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-gray-400">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setColor(c); setCustomColor(""); }}
                  className="h-7 w-7 cursor-pointer rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: color === c && !customColor ? "2px solid white" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
              <input
                type="color"
                value={customColor || color}
                onChange={(e) => setCustomColor(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent"
                title="Color personalizado"
              />
            </div>
            <div className="mt-2">
              <CategoryBadge name={name || "Preview"} color={activeColor} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 cursor-pointer rounded-lg bg-gray-800 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 cursor-pointer rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ColorPicker({
  catId,
  currentColor,
  onSave,
}: {
  catId: string;
  currentColor: string;
  onSave: (id: string, color: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function pick(color: string) {
    setSaving(true);
    await onSave(catId, color);
    setSaving(false);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        title="Cambiar color"
        className="cursor-pointer flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-800 hover:text-gray-300 disabled:opacity-40"
      >
        <span className="inline-block h-3 w-3 rounded-full border border-gray-600" style={{ backgroundColor: currentColor }} />
        <Palette size={11} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 flex flex-wrap gap-2 rounded-xl bg-gray-800 p-3 shadow-xl" style={{ width: 160 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              className="h-7 w-7 cursor-pointer rounded-full transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                outline: currentColor.toLowerCase() === c.toLowerCase() ? "2px solid white" : "none",
                outlineOffset: 2,
              }}
            />
          ))}
          <input
            type="color"
            defaultValue={currentColor}
            onChange={(e) => pick(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent"
            title="Color personalizado"
          />
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCats(await categories.list());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta categoría?")) return;
    try {
      await categories.remove(id);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  async function handleColorChange(id: string, color: string) {
    await categories.update(id, { color });
    setCats((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
  }

  const defaults = cats.filter((c) => c.isDefault);
  const custom = cats.filter((c) => !c.isDefault);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Categorías</h1>
        <button
          onClick={() => setShowModal(true)}
          className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          + Nueva categoría
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Cargando…</div>
      ) : (
        <div className="space-y-6">
          {defaults.length > 0 && (
            <div className="rounded-xl bg-gray-900 p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-400">Categorías predeterminadas</h2>
              <div className="space-y-2">
                {defaults.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-1">
                    <CategoryBadge name={c.name} color={c.color} />
                    <ColorPicker catId={c.id} currentColor={c.color} onSave={handleColorChange} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-gray-900 p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-400">Categorías personalizadas</h2>
            {custom.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-600">Sin categorías personalizadas</p>
            ) : (
              <div className="space-y-2">
                {custom.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-1">
                    <CategoryBadge name={c.name} color={c.color} />
                    <div className="flex items-center gap-1">
                      <ColorPicker catId={c.id} currentColor={c.color} onSave={handleColorChange} />
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="cursor-pointer flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-red-950/40 hover:text-red-400"
                      >
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <CategoryModal
          existingCats={cats}
          onClose={() => setShowModal(false)}
          onSave={load}
        />
      )}
    </div>
  );
}
