"use client";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";

export default function SettingsPage() {
  const { appUser } = useAuth();
  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Profile Settings" description="Your account is managed by the admin approval list." />
        <Card>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Name" value={appUser?.name || "Not set"} />
            <Info label="Email" value={appUser?.email || ""} />
            <Info label="Role" value={appUser?.role || "user"} />
            <Info label="Status" value={appUser?.approved ? "Approved" : "Pending"} />
          </dl>
        </Card>
      </AppShell>
    </ProtectedRoute>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-slate-500">{label}</dt><dd className="font-semibold">{value}</dd></div>;
}
