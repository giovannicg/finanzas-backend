const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
    throw new Error(`No se pudo conectar al servidor (${BASE_URL}). Verifica que el backend esté corriendo.`);
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

export interface Transaction {
  id: string;
  amount: number;
  merchant: string;
  cardLast4?: string;
  date: string;
  category: string;
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
  }) =>
    request<Transaction>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<{ amount: number; merchant: string; category: string; cardLast4: string; date: string }>) =>
    request<Transaction>(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/api/transactions/${id}`, { method: "DELETE" }),
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
}

export const userApi = {
  me: () => request<UserProfile>("/api/users/me"),
  setTotalBudget: (totalBudget: number | null) =>
    request<UserProfile>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ totalBudget }),
    }),
};

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
