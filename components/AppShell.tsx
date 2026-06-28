"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  FileDown,
  FileUp,
  GraduationCap,
  History,
  LayoutDashboard,
  Library,
  Settings,
  ShieldCheck,
  UserRoundPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

const mobileNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Library", icon: Library },
  { href: "/exam/setup", label: "Mock Tests", icon: GraduationCap },
  { href: "/academics", label: "Academics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings }
];

const desktopNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Library", icon: Library },
  { href: "/upload", label: "Upload PDF", icon: FileUp },
  { href: "/exam/setup", label: "Mock Tests", icon: GraduationCap },
  { href: "/academics", label: "Academics", icon: BarChart3, exact: true },
  { href: "/academics/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/academics/scores", label: "Actual scores", icon: BarChart3 },
  { href: "/academics/reports", label: "Reports", icon: FileDown },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { appUser } = useAuth();
  const adminNav = [
    { href: "/admin", label: "Admin", icon: ShieldCheck },
    { href: "/admin/login-requests", label: "Login requests", icon: UserRoundPlus },
    { href: "/admin/academics", label: "Academic data", icon: BarChart3 }
  ];

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-2 py-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white dark:bg-aqua dark:text-slate-950">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold">PadLEI</p>
            <p className="text-xs text-slate-500">Medical study workspace</p>
          </div>
        </Link>
        <nav className="mt-5 space-y-1" aria-label="Main navigation">
          {desktopNav.map((item) => (
            <NavItem key={item.href} item={item} active={item.exact ? pathname === item.href : pathname.startsWith(item.href)} />
          ))}
        </nav>
        {appUser?.role === "admin" ? (
          <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="px-3 text-xs font-semibold uppercase text-slate-500">Administration</p>
            <nav className="mt-2 space-y-1" aria-label="Admin navigation">
              {adminNav.map((item) => <NavItem key={item.href} item={item} active={item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)} />)}
            </nav>
          </div>
        ) : null}
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" className="h-11 w-11 shrink-0 px-0" onClick={() => router.back()} aria-label="Go back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Link href="/dashboard" className="truncate font-bold">PadLEI</Link>
            </div>
            {appUser?.role === "admin" ? (
              <Button className="h-10" variant="secondary" asChild><Link href="/admin"><ShieldCheck className="h-4 w-4" /> Admin</Link></Button>
            ) : null}
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-7xl px-3 py-5 pb-[calc(6.25rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-8">
          <Button variant="ghost" className="mb-4 hidden h-11 px-2 lg:inline-flex" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {children}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/98 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/98 lg:hidden" aria-label="Mobile navigation">
          {mobileNav.map((item) => {
            const active = item.href === "/academics" ? pathname.startsWith("/academics") || pathname === "/history" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold leading-tight", active ? "bg-ink text-white dark:bg-aqua dark:text-slate-950" : "text-slate-600 dark:text-slate-300")}>
                <item.icon className="h-5 w-5" />
                <span className="max-w-full text-center">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function NavItem({ item, active }: { item: { href: string; label: string; icon: React.ElementType }; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition", active ? "bg-ink text-white dark:bg-aqua dark:text-slate-950" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900")}>
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
