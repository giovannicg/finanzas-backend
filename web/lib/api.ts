const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
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
  id: number;
  amount: number;
  merchant: string;
  last4?: string;
  date: string;
  category: { id: number; name: string; color: string };
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
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<Transaction[]>(`/api/transactions${qs}`);
  },
  summary: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<TransactionSummary>(`/api/transactions/summary${qs}`);
  },
  create: (data: {
    amount: number;
    merchant: string;
    categoryId: number;
    last4?: string;
    date?: string;
  }) =>
    request<Transaction>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  remove: (id: number) =>
    request<void>(`/api/transactions/${id}`, { method: "DELETE" }),
};

// ── Categories ────────────────────────────────────────────────────────────────

export interface Category {
  id: number;
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
  remove: (id: number) =>
    request<void>(`/api/categories/${id}`, { method: "DELETE" }),
};

// ── Alerts / Budgets ──────────────────────────────────────────────────────────

export interface Alert {
  id: number;
  categoryId: number;
  category: { id: number; name: string; color: string };
  threshold: number;
  period: "monthly" | "weekly";
  currentSpend: number;
  percentage: number;
}

export const alerts = {
  list: () => request<Alert[]>("/api/alerts"),
  create: (data: {
    categoryId: number;
    threshold: number;
    period: "monthly" | "weekly";
  }) =>
    request<Alert>("/api/alerts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    id: number,
    data: Partial<{ threshold: number; period: "monthly" | "weekly" }>
  ) =>
    request<Alert>(`/api/alerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: number) =>
    request<void>(`/api/alerts/${id}`, { method: "DELETE" }),
};
