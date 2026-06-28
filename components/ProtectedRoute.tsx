"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { appUser, firebaseUser, loading, authError, refreshAppUser } = useAuth();

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace("/");
    if (!loading && adminOnly && appUser?.role !== "admin") router.replace("/dashboard");
    if (!loading && appUser?.mustChangePassword && pathname !== "/settings") {
      router.replace("/settings?section=security&required=1");
    }
  }, [adminOnly, appUser, firebaseUser, loading, pathname, router]);

  if (!loading && firebaseUser && !appUser) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-md text-center">
          <WifiOff className="mx-auto h-9 w-9 text-amber-600" />
          <h1 className="mt-4 text-xl font-bold">Account data is unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{authError || "Check your connection and try again."}</p>
          <Button className="mt-5" onClick={() => void refreshAppUser()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </main>
    );
  }

  if (loading || !firebaseUser || !appUser || (adminOnly && appUser.role !== "admin")) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-aqua" />
      </main>
    );
  }

  return <>{children}</>;
}
