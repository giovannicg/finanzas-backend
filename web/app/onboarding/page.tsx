"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  userApi,
  incomes as incomesApi,
  fixedExpenses as fixedApi,
  plannedEvents as plannedApi,
  funds as fundsApi,
  formatMoney,
  INCOME_TYPE_LABELS,
  PLANNED_EVENT_TYPE_LABELS,
  type IncomeType,
  type PlannedEventType,
  type UserProfile,
} from "@/lib/api";
import { Card, Field, Input, Select, Button, ErrorNote } from "@/components/ui";

/**
 * Configuración inicial por etapas. Se pregunta poco en cada paso y nada es
 * obligatorio salvo la moneda: el usuario puede saltarse cualquier etapa y
 * completarla luego desde su pantalla correspondiente.
 *
 * El progreso se guarda en `user.onboardingStep` para poder retomarlo.
 */

const STEPS = [
  { id: 0, title: "Moneda", blurb: "Para mostrar todos los importes bien" },
  { id: 1, title: "Ingresos", blurb: "Con qué dinero cuentas cada mes" },
  { id: 2, title: "Gastos fijos", blurb: "Tus compromisos mensuales" },
  { id: 3, title: "Celebraciones", blurb: "Cumpleaños, Navidad y gastos anuales" },
  { id: 4, title: "Fondos", blurb: "Emergencias y objetivos de ahorro" },
  { id: 5, title: "Listo", blurb: "Tu plan ya está calculado" },
];

const DONE_STEP = 6;

const CURRENCIES = [
  { code: "USD", label: "Dólar estadounidense (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "MXN", label: "Peso mexicano (MXN)" },
  { code: "COP", label: "Peso colombiano (COP)" },
  { code: "ARS", label: "Peso argentino (ARS)" },
  { code: "GBP", label: "Libra esterlina (GBP)" },
];

/** Celebraciones típicas, para no tener que teclearlas una a una. */
const EVENT_SUGGESTIONS: { name: string; type: PlannedEventType }[] = [
  { name: "Cumpleaños de mamá", type: "BIRTHDAY" },
  { name: "Cumpleaños de papá", type: "BIRTHDAY" },
  { name: "Cumpleaños de mi pareja", type: "BIRTHDAY" },
  { name: "Mi cumpleaños", type: "BIRTHDAY" },
  { name: "Navidad", type: "CHRISTMAS" },
  { name: "Aniversario", type: "ANNIVERSARY" },
  { name: "Vacaciones", type: "VACATION" },
  { name: "Seguro anual", type: "INSURANCE" },
];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((step) => {
        const done = current > step.id;
        const active = current === step.id;
        return (
          <li
            key={step.id}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              active
                ? "bg-indigo-600 text-white"
                : done
                  ? "bg-emerald-950/60 text-emerald-300"
                  : "bg-gray-800 text-gray-500"
            }`}
          >
            {done && <Check size={12} />}
            {step.title}
          </li>
        );
      })}
    </ol>
  );
}

export default function OnboardingPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Contadores de lo creado, para el resumen final.
  const [created, setCreated] = useState({ incomes: 0, fixed: 0, events: 0, funds: 0 });

  // Paso 0 — moneda
  const [currency, setCurrency] = useState("USD");

  // Paso 1 — un ingreso
  const [incomeName, setIncomeName] = useState("Nómina");
  const [incomeType, setIncomeType] = useState<IncomeType>("SALARY");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeVariable, setIncomeVariable] = useState(false);
  const [incomeConservative, setIncomeConservative] = useState("");

  // Paso 2 — un gasto fijo
  const [fixedName, setFixedName] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [fixedVariable, setFixedVariable] = useState(false);

  // Paso 3 — una celebración
  const [eventName, setEventName] = useState(EVENT_SUGGESTIONS[0].name);
  const [eventType, setEventType] = useState<PlannedEventType>("BIRTHDAY");
  const [eventDate, setEventDate] = useState("");
  const [eventBudget, setEventBudget] = useState("");

  // Paso 4 — un fondo
  const [fundName, setFundName] = useState("Emergencias");
  const [fundTarget, setFundTarget] = useState("");
  const [fundBalance, setFundBalance] = useState("");
  const [fundContribution, setFundContribution] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await userApi.me();
      setProfile(me);
      setCurrency(me.currency);
      // Se retoma donde lo dejó; si ya terminó, se muestra el resumen.
      setStep(me.onboardingStep >= DONE_STEP ? 5 : me.onboardingStep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar tu perfil");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const money = (n: number) => formatMoney(n, currency, profile?.locale ?? "en-US");

  /** Guarda el progreso y avanza. `completed` es el paso que se acaba de terminar. */
  async function advance(completed: number) {
    const next = completed + 1;
    try {
      const updated = await userApi.update({
        onboardingStep: next >= 5 ? DONE_STEP : next,
      });
      setProfile(updated);
    } catch {
      // El progreso es una comodidad: si no se guarda, el recorrido sigue.
    }
    setStep(next);
  }

  async function saveCurrency() {
    setError(null);
    setSaving(true);
    try {
      const updated = await userApi.update({ currency });
      setProfile(updated);
      await advance(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la moneda");
    } finally {
      setSaving(false);
    }
  }

  async function saveIncome(andContinue: boolean) {
    setError(null);
    setSaving(true);
    try {
      await incomesApi.create({
        name: incomeName,
        type: incomeType,
        amount: parseFloat(incomeAmount),
        isVariable: incomeVariable,
        conservativeAmount:
          incomeVariable && incomeConservative ? parseFloat(incomeConservative) : null,
        frequency: "MONTHLY",
      });
      setCreated((c) => ({ ...c, incomes: c.incomes + 1 }));
      setIncomeName("");
      setIncomeAmount("");
      setIncomeConservative("");
      setIncomeVariable(false);
      if (andContinue) await advance(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el ingreso");
    } finally {
      setSaving(false);
    }
  }

  async function saveFixed(andContinue: boolean) {
    setError(null);
    setSaving(true);
    try {
      await fixedApi.create({
        name: fixedName,
        amount: parseFloat(fixedAmount),
        isVariableAmount: fixedVariable,
      });
      setCreated((c) => ({ ...c, fixed: c.fixed + 1 }));
      setFixedName("");
      setFixedAmount("");
      setFixedVariable(false);
      if (andContinue) await advance(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el gasto");
    } finally {
      setSaving(false);
    }
  }

  async function saveEvent(andContinue: boolean) {
    setError(null);
    setSaving(true);
    try {
      await plannedApi.create({
        name: eventName,
        type: eventType,
        eventDate,
        yearlyRecurring: true,
        budgetAmount: parseFloat(eventBudget),
      });
      setCreated((c) => ({ ...c, events: c.events + 1 }));
      setEventName("");
      setEventBudget("");
      setEventDate("");
      if (andContinue) await advance(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el evento");
    } finally {
      setSaving(false);
    }
  }

  async function saveFund(andContinue: boolean) {
    setError(null);
    setSaving(true);
    try {
      await fundsApi.create({
        name: fundName,
        type: "EMERGENCY",
        targetAmount: fundTarget ? parseFloat(fundTarget) : null,
        balance: fundBalance ? parseFloat(fundBalance) : 0,
        monthlyContribution: fundContribution ? parseFloat(fundContribution) : null,
      });
      setCreated((c) => ({ ...c, funds: c.funds + 1 }));
      setFundName("");
      setFundTarget("");
      setFundBalance("");
      setFundContribution("");
      if (andContinue) await advance(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el fondo");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    );
  }

  const current = STEPS[Math.min(step, 5)];

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuración inicial</h1>
          <p className="text-sm text-gray-500">
            Cinco pasos cortos. Puedes saltarte cualquiera y completarlo después.
          </p>
        </div>

        <Stepper current={step} />
        <ErrorNote message={error} />

        <Card title={current.title}>
          <p className="mb-5 text-sm text-gray-400">{current.blurb}</p>

          {/* ── Paso 0: moneda ── */}
          {step === 0 && (
            <div className="space-y-4">
              <Field label="¿En qué moneda manejas tu dinero?">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-gray-500">
                Así se verán tus importes: {money(1234.5)}
              </p>
              <Button onClick={saveCurrency} disabled={saving}>
                {saving ? "Guardando…" : "Continuar"}
              </Button>
            </div>
          )}

          {/* ── Paso 1: ingresos ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre del ingreso">
                  <Input
                    value={incomeName}
                    onChange={(e) => setIncomeName(e.target.value)}
                    placeholder="Nómina"
                  />
                </Field>
                <Field label="Tipo">
                  <Select value={incomeType} onChange={(e) => setIncomeType(e.target.value as IncomeType)}>
                    {(Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map((t) => (
                      <option key={t} value={t}>{INCOME_TYPE_LABELS[t]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cuánto cobras al mes">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={incomeAmount}
                    onChange={(e) => setIncomeAmount(e.target.value)}
                  />
                </Field>
                <Field label="¿Varía cada mes?">
                  <div className="flex h-[38px] items-center gap-2">
                    <input
                      type="checkbox"
                      checked={incomeVariable}
                      onChange={(e) => setIncomeVariable(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-indigo-500"
                    />
                    <span className="text-sm text-gray-300">Es variable</span>
                  </div>
                </Field>
                {incomeVariable && (
                  <Field
                    label="Estimación prudente"
                    hint="El mínimo con el que puedes contar. Es lo que usará el plan."
                  >
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={incomeConservative}
                      onChange={(e) => setIncomeConservative(e.target.value)}
                    />
                  </Field>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveIncome(false)} disabled={saving || !incomeAmount} variant="ghost">
                  Guardar y añadir otro
                </Button>
                <Button onClick={() => saveIncome(true)} disabled={saving || !incomeAmount}>
                  Guardar y continuar
                </Button>
                <Button variant="ghost" onClick={() => advance(1)}>Saltar</Button>
              </div>
              {created.incomes > 0 && (
                <p className="text-xs text-emerald-400">
                  {created.incomes} {created.incomes === 1 ? "ingreso guardado" : "ingresos guardados"}
                </p>
              )}
            </div>
          )}

          {/* ── Paso 2: gastos fijos ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input
                    value={fixedName}
                    onChange={(e) => setFixedName(e.target.value)}
                    placeholder="Alquiler, luz, Netflix…"
                  />
                </Field>
                <Field label="Importe mensual">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value)}
                  />
                </Field>
                <Field label="¿El importe varía?" hint="Luz, agua, supermercado…">
                  <div className="flex h-[38px] items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fixedVariable}
                      onChange={(e) => setFixedVariable(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-indigo-500"
                    />
                    <span className="text-sm text-gray-300">Es una estimación</span>
                  </div>
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveFixed(false)} disabled={saving || !fixedName || !fixedAmount} variant="ghost">
                  Guardar y añadir otro
                </Button>
                <Button onClick={() => saveFixed(true)} disabled={saving || !fixedName || !fixedAmount}>
                  Guardar y continuar
                </Button>
                <Button variant="ghost" onClick={() => advance(2)}>Saltar</Button>
              </div>
              {created.fixed > 0 && (
                <p className="text-xs text-emerald-400">{created.fixed} gastos fijos guardados</p>
              )}
            </div>
          )}

          {/* ── Paso 3: celebraciones ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {EVENT_SUGGESTIONS.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => { setEventName(s.name); setEventType(s.type); }}
                    className={`cursor-pointer rounded-full px-3 py-1 text-xs transition-colors ${
                      eventName === s.name
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre del evento">
                  <Input value={eventName} onChange={(e) => setEventName(e.target.value)} />
                </Field>
                <Field label="Tipo">
                  <Select value={eventType} onChange={(e) => setEventType(e.target.value as PlannedEventType)}>
                    {(Object.keys(PLANNED_EVENT_TYPE_LABELS) as PlannedEventType[]).map((t) => (
                      <option key={t} value={t}>{PLANNED_EVENT_TYPE_LABELS[t]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fecha" hint="Se repetirá cada año">
                  <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                </Field>
                <Field label="Cuánto quieres gastar">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={eventBudget}
                    onChange={(e) => setEventBudget(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => saveEvent(false)}
                  disabled={saving || !eventName || !eventDate || !eventBudget}
                  variant="ghost"
                >
                  Guardar y añadir otro
                </Button>
                <Button
                  onClick={() => saveEvent(true)}
                  disabled={saving || !eventName || !eventDate || !eventBudget}
                >
                  Guardar y continuar
                </Button>
                <Button variant="ghost" onClick={() => advance(3)}>Saltar</Button>
              </div>
              {created.events > 0 && (
                <p className="text-xs text-emerald-400">{created.events} eventos guardados</p>
              )}
            </div>
          )}

          {/* ── Paso 4: fondos ── */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="rounded-lg bg-gray-800/60 px-3 py-2 text-xs text-gray-400">
                El fondo de emergencia es el primero que conviene tener: cubre lo inesperado sin
                tocar el dinero que ya reservaste para otras cosas.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre del fondo">
                  <Input value={fundName} onChange={(e) => setFundName(e.target.value)} />
                </Field>
                <Field label="Saldo actual" hint="Lo que ya tengas apartado">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fundBalance}
                    onChange={(e) => setFundBalance(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Objetivo" hint="Opcional">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fundTarget}
                    onChange={(e) => setFundTarget(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Aportación mensual" hint="Opcional">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fundContribution}
                    onChange={(e) => setFundContribution(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveFund(false)} disabled={saving || !fundName} variant="ghost">
                  Guardar y añadir otro
                </Button>
                <Button onClick={() => saveFund(true)} disabled={saving || !fundName}>
                  Guardar y terminar
                </Button>
                <Button variant="ghost" onClick={() => advance(4)}>Saltar</Button>
              </div>
              {created.funds > 0 && (
                <p className="text-xs text-emerald-400">{created.funds} fondos creados</p>
              )}
            </div>
          )}

          {/* ── Paso 5: resumen ── */}
          {step >= 5 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">
                Ya tienes lo necesario para que la app calcule tu plan mensual: cuánto queda libre
                después de los gastos fijos, los límites de gasto variable, la provisión para tus
                eventos y tus aportaciones a fondos.
              </p>
              <div className="space-y-2 rounded-lg bg-gray-800/60 p-4 text-sm text-gray-400">
                <p>Moneda: <span className="text-gray-200">{currency}</span></p>
                {created.incomes > 0 && <p>{created.incomes} ingresos registrados</p>}
                {created.fixed > 0 && <p>{created.fixed} gastos fijos registrados</p>}
                {created.events > 0 && <p>{created.events} eventos previsibles</p>}
                {created.funds > 0 && <p>{created.funds} fondos de ahorro</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/plan">
                  <Button>Ver mi plan mensual</Button>
                </Link>
                <Link href="/dashboard/budgets">
                  <Button variant="ghost">Poner límites de gasto diario</Button>
                </Link>
              </div>
              <p className="text-xs text-gray-500">
                Siguiente paso recomendado: fija un límite mensual para cafés, restaurantes y ocio
                en la pantalla de Presupuestos. Sin ese límite, el plan no puede avisarte cuando te
                pasas.
              </p>
            </div>
          )}
        </Card>

        {step < 5 && (
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              Atrás
            </Button>
            <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-300">
              Salir y seguir luego
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
