"use client";

import { useCallback, useEffect, useState } from "react";
import { userApi, formatMoney, type UserProfile } from "./api";

/**
 * Perfil del usuario con su moneda. Se usa en todas las pantallas que muestran
 * importes, para que el formato salga de la configuración y no esté quemado.
 */
export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    userApi
      .me()
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { /* la pantalla ya muestra sus propios errores */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const money = useCallback(
    (amount: number) => formatMoney(amount, profile?.currency ?? "USD", profile?.locale ?? "en-US"),
    [profile?.currency, profile?.locale]
  );

  return { profile, loading, money, setProfile };
}
