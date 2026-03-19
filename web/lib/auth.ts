"use client";

export function saveToken(token: string) {
  localStorage.setItem("token", token);
  // Also set a cookie so middleware can read it
  document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function clearToken() {
  localStorage.removeItem("token");
  document.cookie = "token=; path=/; max-age=0";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}
