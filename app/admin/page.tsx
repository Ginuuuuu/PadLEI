"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AdminStats } from "@/components/AdminStats";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AdminPage() {
  return (
    <ProtectedRoute adminOnly>
      <AppShell>
        <PageHeader title="Admin Dashboard" description="Manage access, files, performance visibility, and platform health." />
        <AdminStats />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="font-bold">Approved Users</h2>
            <p className="mt-2 text-sm text-slate-500">Add emails, remove users, and assign user/admin roles.</p>
            <Button className="mt-4" asChild><Link href="/admin/users">Manage users</Link></Button>
          </Card>
          <Card>
            <h2 className="font-bold">Files & Performance</h2>
            <p className="mt-2 text-sm text-slate-500">Review uploaded PDFs and exam summaries when enabled by admin policy.</p>
            <Button className="mt-4" variant="secondary" asChild><Link href="/admin/files">View files</Link></Button>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
