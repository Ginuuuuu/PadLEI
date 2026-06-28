"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { dataOwnerId } from "@/lib/account";
import { db } from "@/lib/firebase";
import type { ThemePreference } from "@/types/models";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: "light" | "dark";
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { appUser, refreshAppUser } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredTheme());
  const [systemDark, setSystemDark] = useState(false);
  const resolvedTheme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!appUser?.themePreference) return;
    setPreferenceState(appUser.themePreference);
    localStorage.setItem("padlei-theme", appUser.themePreference);
  }, [appUser?.themePreference]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  async function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    localStorage.setItem("padlei-theme", next);
    if (!appUser) return;
    const now = new Date().toISOString();
    await Promise.all([
      setDoc(doc(db, "users", appUser.uid), { themePreference: next, updatedAt: now }, { merge: true }),
      setDoc(doc(db, "userPreferences", dataOwnerId(appUser)), {
        userId: dataOwnerId(appUser),
        themePreference: next,
        updatedAt: now
      }, { merge: true })
    ]);
    await refreshAppUser();
  }

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [appUser, preference, refreshAppUser, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem("padlei-theme");
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
