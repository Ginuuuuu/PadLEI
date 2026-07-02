"use client";

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  User,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { AppUser } from "@/types/models";

type AuthContextValue = {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  authError: string;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAppUser: () => Promise<AppUser | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const denied = "Access denied. New users must request login access from Admin.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [seededOwnerId, setSeededOwnerId] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);

  const refreshAppUser = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setAppUser(null);
      return null;
    }

    const token = await user.getIdToken();
    const response = await fetch("/api/account/sync", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });
    const payload = (await response.json().catch(() => ({}))) as { user?: AppUser; error?: string };
    if (!response.ok || !payload.user) {
      const error = new Error(payload.error || "Could not synchronize your account.");
      Object.assign(error, { status: response.status });
      throw error;
    }

    setAppUser(payload.user);
    setAuthError("");
    return payload.user;
  }, []);

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    let cancelled = false;

    async function initializeAuthentication() {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // Firebase still uses its configured persistence if initialization is unavailable.
      }

      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        setFirebaseUser(user);
        if (!user) {
          setAppUser(null);
          setAuthError("");
          setLoading(false);
          return;
        }

        
        try {
          await refreshAppUser();
        } catch (error) {
          const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
          const message = error instanceof Error ? error.message : "Account data is temporarily unavailable.";
          if (status === 401 || status === 403) {
            await signOut(auth);
            setFirebaseUser(null);
            setAppUser(null);
          }
          setAuthError(message);
        } finally {
          setLoading(false);
        }
      });
    }

    void initializeAuthentication();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refreshAppUser]);

  useEffect(() => {
    if (!appUser || seededOwnerId === appUser.ownerId) return;
    let cancelled = false;
    seedDefaultPdfs().then((ok) => {
      if (ok && !cancelled) setSeededOwnerId(appUser.ownerId);
    });
    return () => {
      cancelled = true;
    };
  }, [appUser, seededOwnerId]);

  async function assertApproved() {
    try {
      const approvedUser = await refreshAppUser();
      if (!approvedUser?.approved) throw new Error(denied);
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (status === 401 || status === 403) await signOut(auth);
      throw error;
    }
  }

  async function loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      await assertApproved();
    } catch (error) {
      throw new Error(readableAuthError(error, "Google login failed. Try again or use email login."));
    }
  }

  async function loginWithEmail(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await assertApproved();
    } catch (error) {
      throw new Error(readableAuthError(error, "Email login failed."));
    }
  }

  const value = useMemo(
    () => ({
      firebaseUser,
      appUser,
      loading,
      authError,
      loginWithGoogle,
      loginWithEmail,
      logout: () => signOut(auth),
      refreshAppUser
    }),
    [firebaseUser, appUser, loading, authError, refreshAppUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function seedDefaultPdfs() {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return false;
    const response = await fetch("/api/default-pdfs/seed", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.ok;
  } catch {
    return false;
  }
}

function readableAuthError(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : fallback;

  if (message.startsWith("Access denied")) return message;
  if (message.includes("synchronize")) return message;
  if (code === "auth/popup-closed-by-user") return "Google login was closed before completion.";
  if (code === "auth/popup-blocked") return "Google popup was blocked. Allow popups for this site and try again.";
  if (code === "auth/unauthorized-domain") return "This domain is not allowed in Firebase Authentication settings.";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Email/password account not found or password is wrong. Ask Admin for a password reset link.";
  }

  return message || fallback;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
