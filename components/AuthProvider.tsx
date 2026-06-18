"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
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
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { AppUser } from "@/types/models";

type AuthContextValue = {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const denied = "Access denied. Please contact admin for login access.";
const bootstrapAdminEmail = process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
    return onAuthStateChanged(auth, async (user) => {
      try {
        setFirebaseUser(user);
        if (!user?.email) {
          setAppUser(null);
          setLoading(false);
          return;
        }

        const approvedUser = await resolveApprovedUser(user, true);
        if (!approvedUser?.approved) {
          await signOut(auth);
          setAppUser(null);
          setLoading(false);
          return;
        }

        setAppUser(approvedUser);
        setLoading(false);
      } catch {
        await signOut(auth);
        setAppUser(null);
        setLoading(false);
      }
    });
  }, []);

  async function assertApproved(user: User) {
    if (!user.email) throw new Error(denied);
    let record: AppUser | null = null;

    try {
      record = await resolveApprovedUser(user, true);
    } catch (error) {
      await signOut(auth);
      if (error instanceof Error && error.message.includes("permission")) {
        throw new Error("Login approved, but Firebase rules are blocking profile access. Deploy the updated Firestore rules.");
      }
      throw error;
    }

    if (!record?.approved) {
      await signOut(auth);
      throw new Error(`Access denied for ${user.email}. Ask admin to approve this exact email.`);
    }

    setAppUser(record);
  }

  async function resolveApprovedUser(user: User, allowBootstrap: boolean) {
    if (!user.email) return null;
    const normalizedEmail = user.email.toLowerCase();
    const userRef = doc(db, "users", user.uid);
    let snapshot = await getDoc(userRef);
    let record = snapshot.data() as AppUser | undefined;

    if (snapshot.exists() && record?.approved) {
      return {
        ...record,
        uid: user.uid,
        email: normalizedEmail,
        name: user.displayName || record.name || ""
      };
    }

    if (!snapshot.exists()) {
      const approval = await getDoc(doc(db, "approvals", normalizedEmail)).catch(() => null);
      if (approval?.exists()) {
        const approvedEmail = approval.data() as Pick<AppUser, "email" | "role" | "approved" | "createdAt">;
        record = {
          uid: user.uid,
          email: normalizedEmail,
          name: user.displayName || "",
          role: approvedEmail.role || "user",
          approved: approvedEmail.approved,
          createdAt: approvedEmail.createdAt || new Date().toISOString()
        };
      } else {
        const approvedByEmail = await getDocs(query(collection(db, "users"), where("email", "==", normalizedEmail), limit(1)));
        const pending = approvedByEmail.docs[0];
        if (pending?.exists()) {
          record = pending.data() as AppUser;
          snapshot = pending;
        }
      }
    }

    if (!record?.approved && allowBootstrap && bootstrapAdminEmail && normalizedEmail === bootstrapAdminEmail) {
      record = {
        uid: user.uid,
        email: normalizedEmail,
        name: user.displayName || "Admin",
        role: "admin",
        approved: true,
        createdAt: new Date().toISOString()
      };
    }

    if (!record?.approved) return null;

    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: normalizedEmail,
        name: user.displayName || record.name || "",
        role: record.role || "user",
        approved: true,
        createdAt: record.createdAt || new Date().toISOString()
      },
      { merge: true }
    );

    return { ...record, uid: user.uid, email: normalizedEmail };
  }

  async function loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      await assertApproved(result.user);
    } catch (error) {
      throw new Error(readableAuthError(error, "Google login failed. Try again or use email login."));
    }
  }

  async function loginWithEmail(email: string, password: string) {
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await assertApproved(result.user);
    } catch (error) {
      throw new Error(readableAuthError(error, "Email login failed."));
    }
  }

  const value = useMemo(
    () => ({
      firebaseUser,
      appUser,
      loading,
      loginWithGoogle,
      loginWithEmail,
      logout: () => signOut(auth)
    }),
    [firebaseUser, appUser, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function readableAuthError(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : fallback;

  if (message.startsWith("Access denied")) return message;
  if (message.includes("Firebase rules are blocking")) return message;
  if (code === "auth/popup-closed-by-user") return "Google login was closed before completion.";
  if (code === "auth/popup-blocked") return "Google popup was blocked. Allow popups for this site and try again.";
  if (code === "auth/unauthorized-domain") return "This local domain is not allowed in Firebase Authentication settings.";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Email/password account not found or password is wrong. Admin approval does not create a Firebase Auth password account. Create this user in Firebase Authentication, or use Google login with the approved email.";
  }

  return message || fallback;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
