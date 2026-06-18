"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, FileUp, GraduationCap, History, LayoutDashboard, LogOut, Settings, ShieldCheck, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: FileUp },
  { href: "/exam/setup", label: "Mock Test", icon: GraduationCap },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { appUser, logout } = useAuth();
  const adminNav = [
    { href: "/admin", label: "Admin", icon: ShieldCheck },
    { href: "/admin/login-requests", label: "Login Requests", icon: UserRoundPlus }
  ];
  const mobileNav = appUser?.role === "admin" ? [...nav, ...adminNav] : nav;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/70 bg-white/80 p-4 backdrop-blur lg:block">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-2 py-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold">Study Platform</p>
            <p className="text-xs text-slate-500">Developer: Ginu</p>
          </div>
        </Link>
        <nav className="mt-6 space-y-1">
          {nav.map((item) => (
            <NavItem key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
          {appUser?.role === "admin"
            ? adminNav.map((item) => <NavItem key={item.href} item={item} active={item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)} />)
            : null}
        </nav>
        <Button variant="ghost" className="absolute bottom-4 left-4 right-4 justify-start" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="h-9 w-9 px-0" onClick={() => router.back()} aria-label="Go back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Link href="/dashboard" className="font-bold">Study Platform</Link>
            </div>
            <Button variant="ghost" className="h-9 px-3" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {mobileNav.map((item) => (
              <Link key={item.href} href={item.href} className={cn("rounded-lg px-3 py-2 text-sm font-semibold", (item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)) ? "bg-ink text-white" : "bg-white text-ink")}>
                {item.label}
              </Link>
            ))}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" className="mb-4 hidden h-9 px-2 lg:inline-flex" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {children}
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-slate-500">Developer: Ginu</footer>
      </div>
    </div>
  );
}

function NavItem({ item, active }: { item: { href: string; label: string; icon: React.ElementType }; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition", active ? "bg-ink text-white" : "text-slate-600 hover:bg-white")}>
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
