"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const router = useRouter();
  const { appUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && !appUser) router.replace("/");
    if (!loading && adminOnly && appUser?.role !== "admin") router.replace("/dashboard");
  }, [adminOnly, appUser, loading, router]);

  if (loading || !appUser || (adminOnly && appUser.role !== "admin")) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-aqua" />
      </main>
    );
  }

  return <>{children}</>;
}
