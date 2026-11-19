// Vacío = mismo dominio (/api/...). Define NEXT_PUBLIC_API_URL solo para apuntar a otro backend.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(`No se pudo conectar al servidor (${BASE_URL || window.location.origin}). Verifica que el backend esté corriendo.`);
  }

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      const onAuthPage = window.location.pathname.startsWith("/login") ||
        window.location.pathname.startsWith("/register");
      if (!onAuthPage) {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    throw new Error("Credenciales inválidas");
  }

  if (!res.ok) {
    let message: string;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = await res.json().catch(() => ({}));
      message = json.error ?? json.message ?? res.statusText;
    } else {
      // Evita tirar HTML crudo como mensaje de error
      message = `Error ${res.status}: ${res.statusText || "respuesta inesperada del servidor"}`;
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: { id: number; email: string; name: string };
}

export const auth = {
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
};

// ── Transactions ──────────────────────────────────────────────────────────────

export type ExpenseType = "FIXED" | "PLANNED" | "VARIABLE" | "UNEXPECTED";

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  FIXED: "Fijo mensual",
  PLANNED: "Previsible",
  VARIABLE: "Variable cotidiano",
  UNEXPECTED: "Imprevisto",
};

export interface Transaction {
  id: string;
  amount: number;
  merchant: string;
  cardLast4?: string;
  date: string;
  category: string;
  expenseType?: ExpenseType;
  plannedEventId?: string | null;
  installments?: number;
  installmentNumber?: number;
  installmentGroupId?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
}

export interface TransactionSummary {
  totalSpent: number;
  transactionCount: number;
  topCategory: string | null;
  alertsTriggered: number;
  byCategory: { category: string; color: string; total: number }[];
  monthly: { month: string; total: number }[];
}

export const transactions = {
  list: async (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ transactions: Transaction[]; total: number; page: number }>(`/api/transactions${qs}`);
  },
  summary: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<TransactionSummary>(`/api/transactions/summary${qs}`);
  },
  create: (data: {
    amount: number;
    merchant: string;
    category: string;
    cardLast4?: string;
    date?: string;
    installments?: number;
    expenseType?: ExpenseType;
  }) =>
    request<Transaction | { installmentGroupId: string; count: number; monthlyAmount: number; totalAmount: number }>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<{ amount: number; merchant: string; category: string; cardLast4: string; date: string; installments: number; expenseType: ExpenseType }>) =>
    request<Transaction | { installmentGroupId: string; count: number; monthlyAmount: number; totalAmount: number }>(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string, all?: boolean) =>
    request<void>(`/api/transactions/${id}${all ? "?all=true" : ""}`, { method: "DELETE" }),
};

// ── Categories ────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
}

export const categories = {
  list: () => request<Category[]>("/api/categories"),
  create: (data: { name: string; color: string }) =>
    request<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; color?: string }) =>
    request<Category>(`/api/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/api/categories/${id}`, { method: "DELETE" }),
};

// ── Alerts / Budgets ──────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  category: string;
  limitAmount: number;
  period: "monthly" | "weekly";
  active: boolean;
  currentSpend: number;
  percentage: number;
}

export const alerts = {
  list: () => request<Alert[]>("/api/alerts"),
  create: (data: {
    category: string;
    limitAmount: number;
    period: "monthly" | "weekly";
  }) =>
    request<Alert>("/api/alerts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Partial<{ limitAmount: number; period: "monthly" | "weekly" }>
  ) =>
    request<Alert>(`/api/alerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/api/alerts/${id}`, { method: "DELETE" }),
};

// ── User ──────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  inboxEmail: string;
  totalBudget: number | null;
  currency: string;
  locale: string;
  onboardingStep: number;
}

export const userApi = {
  me: () => request<UserProfile>("/api/users/me"),
  setTotalBudget: (totalBudget: number | null) =>
    request<UserProfile>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ totalBudget }),
    }),
  update: (data: Partial<{ currency: string; locale: string; onboardingStep: number }>) =>
    request<UserProfile>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

/** Formatea un importe con la moneda y el locale del usuario. */
export function formatMoney(amount: number, currency = "USD", locale = "en-US"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Moneda o locale inválidos: se degrada a un formato simple en vez de fallar.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ── API Tokens ─────────────────────────────────────────────────────────────────

export interface ApiToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  token?: string; // solo presente al crear
}

export const apiTokens = {
  list: () => request<ApiToken[]>("/api/tokens"),
  create: (name: string) =>
    request<ApiToken>("/api/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) => request<void>(`/api/tokens/${id}`, { method: "DELETE" }),
};

// ── Ingresos ──────────────────────────────────────────────────────────────────

export type IncomeType = "SALARY" | "SECONDARY" | "EXTRAORDINARY" | "OTHER";

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  SALARY: "Salario o ingreso principal",
  SECONDARY: "Ingreso secundario",
  EXTRAORDINARY: "Ingreso extraordinario",
  OTHER: "Otro ingreso",
};

export interface Income {
  id: string;
  name: string;
  type: IncomeType;
  amount: number;
  isVariable: boolean;
  conservativeAmount: number | null;
  frequency: "MONTHLY" | "ONE_TIME";
  dayOfMonth: number | null;
  receivedOn: string | null;
  active: boolean;
  /** Importe que el presupuesto usa de verdad (el prudente si es variable). */
  planningAmount: number;
}

export type IncomeInput = {
  name: string;
  type?: IncomeType;
  amount: number;
  isVariable?: boolean;
  conservativeAmount?: number | null;
  frequency?: "MONTHLY" | "ONE_TIME";
  dayOfMonth?: number | null;
  receivedOn?: string | null;
};

export const incomes = {
  list: () => request<Income[]>("/api/incomes"),
  create: (data: IncomeInput) =>
    request<Income>("/api/incomes", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<IncomeInput & { active: boolean }>) =>
    request<Income>(`/api/incomes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => request<void>(`/api/incomes/${id}`, { method: "DELETE" }),
};

// ── Gastos fijos mensuales ────────────────────────────────────────────────────

export interface FixedExpense {
  id: string;
  name: string;
  category: string;
  amount: number;
  /** true para gastos necesarios cuyo importe varía: luz, agua, supermercado. */
  isVariableAmount: boolean;
  dayOfMonth: number | null;
  active: boolean;
}

export type FixedExpenseInput = {
  name: string;
  category?: string;
  amount: number;
  isVariableAmount?: boolean;
  dayOfMonth?: number | null;
};

export interface FixedExpenseList {
  expenses: FixedExpense[];
  total: number;
  fixedAmountTotal: number;
  estimatedAmountTotal: number;
}

export const fixedExpenses = {
  list: () => request<FixedExpenseList>("/api/fixed-expenses"),
  create: (data: FixedExpenseInput) =>
    request<FixedExpense>("/api/fixed-expenses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<FixedExpenseInput & { active: boolean }>) =>
    request<FixedExpense>(`/api/fixed-expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) => request<void>(`/api/fixed-expenses/${id}`, { method: "DELETE" }),
};

// ── Eventos previsibles (gastos no mensuales) ─────────────────────────────────

export type PlannedEventType =
  | "BIRTHDAY"
  | "CHRISTMAS"
  | "ANNIVERSARY"
  | "VACATION"
  | "INSURANCE"
  | "DOCUMENT"
  | "MAINTENANCE"
  | "CELEBRATION"
  | "OTHER";

export const PLANNED_EVENT_TYPE_LABELS: Record<PlannedEventType, string> = {
  BIRTHDAY: "Cumpleaños",
  CHRISTMAS: "Navidad",
  ANNIVERSARY: "Aniversario",
  VACATION: "Vacaciones",
  INSURANCE: "Seguro anual",
  DOCUMENT: "Renovación de documentos",
  MAINTENANCE: "Mantenimiento de dispositivos",
  CELEBRATION: "Celebración familiar",
  OTHER: "Otro gasto esperado",
};

export interface PlannedEvent {
  id: string;
  name: string;
  type: PlannedEventType;
  eventDate: string;
  /** Próxima vez que ocurre, ya calculada para eventos anuales. */
  nextDate: string;
  yearlyRecurring: boolean;
  budgetAmount: number;
  savedAmount: number;
  remaining: number;
  monthsRemaining: number;
  /** Lo que hay que apartar cada mes para llegar con el dinero completo. */
  requiredMonthlySaving: number;
  progress: number;
  fundId: string | null;
  notes: string | null;
}

export type PlannedEventInput = {
  name: string;
  type?: PlannedEventType;
  eventDate: string;
  yearlyRecurring?: boolean;
  budgetAmount: number;
  savedAmount?: number;
  fundId?: string | null;
  notes?: string | null;
};

export interface PlannedEventList {
  events: PlannedEvent[];
  totalBudget: number;
  totalSaved: number;
  totalMonthlyProvision: number;
}

export const plannedEvents = {
  list: () => request<PlannedEventList>("/api/planned-events"),
  create: (data: PlannedEventInput) =>
    request<PlannedEvent>("/api/planned-events", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<PlannedEventInput & { active: boolean }>) =>
    request<PlannedEvent>(`/api/planned-events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  /** Aparta dinero: transferencia, no gasto. */
  reserve: (id: string, amount: number) =>
    request<PlannedEvent>(`/api/planned-events/${id}/reserve`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  /** Registra el pago real y consume el dinero ya reservado. */
  settle: (id: string, data: { amount?: number; merchant?: string; category?: string; date?: string }) =>
    request<{
      transaction: Transaction;
      event: PlannedEvent;
      consumedFromReserve: number;
      uncovered: number;
    }>(`/api/planned-events/${id}/settle`, { method: "POST", body: JSON.stringify(data) }),
  remove: (id: string) => request<void>(`/api/planned-events/${id}`, { method: "DELETE" }),
};

// ── Fondos de ahorro ──────────────────────────────────────────────────────────

export type FundType =
  | "BIRTHDAYS"
  | "CHRISTMAS"
  | "VACATION"
  | "ANNUAL"
  | "EMERGENCY"
  | "GOAL"
  | "INVESTMENT";

export const FUND_TYPE_LABELS: Record<FundType, string> = {
  BIRTHDAYS: "Cumpleaños",
  CHRISTMAS: "Navidad",
  VACATION: "Vacaciones",
  ANNUAL: "Gastos anuales",
  EMERGENCY: "Emergencias",
  GOAL: "Objetivo financiero",
  INVESTMENT: "Inversiones",
};

export interface Fund {
  id: string;
  name: string;
  type: FundType;
  targetAmount: number | null;
  balance: number;
  targetDate: string | null;
  monthlyContribution: number | null;
  suggestedMonthlyContribution: number | null;
  progress: number | null;
  allocatedToEvents: number;
  unallocated: number;
  overAllocated: boolean;
  /** Si es true su aportación ya está contada en las provisiones de eventos. */
  fundedByEventProvisions: boolean;
  events: { id: string; name: string; savedAmount: number }[];
}

export type FundInput = {
  name: string;
  type?: FundType;
  targetAmount?: number | null;
  balance?: number;
  targetDate?: string | null;
  monthlyContribution?: number | null;
};

export interface FundMovement {
  id: string;
  fundId: string;
  amount: number;
  type: "DEPOSIT" | "WITHDRAWAL";
  date: string;
  note: string | null;
  plannedEventId: string | null;
}

export const funds = {
  list: () => request<{ funds: Fund[]; totalBalance: number }>("/api/funds"),
  create: (data: FundInput) =>
    request<Fund>("/api/funds", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<FundInput, "balance">>) =>
    request<Fund>(`/api/funds/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  /** Aporta o retira. Mover dinero a un fondo no es gastarlo. */
  move: (id: string, data: { amount: number; type: "DEPOSIT" | "WITHDRAWAL"; note?: string; date?: string }) =>
    request<{ movement: FundMovement; fund: Fund }>(`/api/funds/${id}/movements`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  movements: (id: string) => request<FundMovement[]>(`/api/funds/${id}/movements`),
  remove: (id: string) => request<void>(`/api/funds/${id}`, { method: "DELETE" }),
};

// ── Presupuesto mensual ───────────────────────────────────────────────────────

export interface BudgetWarning {
  level: "INFO" | "WARN" | "DANGER";
  message: string;
}

export interface MonthlyBudget {
  year: number;
  month: number;
  currency: string;
  income: {
    recurring: number;
    oneTime: number;
    total: number;
    usesConservativeEstimate: boolean;
  };
  allocations: {
    fixedExpenses: number;
    variableBudget: number;
    eventProvisions: number;
    emergencyFund: number;
    savingsAndInvestment: number;
    total: number;
  };
  available: number;
  actual: {
    byType: Record<ExpenseType, number>;
    total: number;
  };
  comparison: {
    fixed: { budgeted: number; actual: number; difference: number };
    variable: { budgeted: number; actual: number; difference: number };
    planned: { actual: number };
    unexpected: { actual: number };
  };
  upcomingEvents: PlannedEvent[];
  warnings: BudgetWarning[];
}

export const budget = {
  monthly: (year: number, month: number) =>
    request<MonthlyBudget>(`/api/budget/monthly?year=${year}&month=${month}`),
};
