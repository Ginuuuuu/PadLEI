"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Check, KeyRound, Trash2, UserCheck, X } from "lucide-react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { auth, db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { formatDate } from "@/lib/utils";
import type { LoginRequest, UserRole } from "@/types/models";

export default function LoginRequestsPage() {
  const { appUser } = useAuth();
  const [requests, setRequests] = useState<LoginRequest[]>([]);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(
      query(collection(db, "loginRequests"), orderBy("createdAt", "desc")),
      (snapshot) => setRequests(snapshot.docs.map((item) => item.data() as LoginRequest)),
      (error) => handleSnapshotError(error, "login requests")
    );
  }, [appUser]);

  async function runAction(request: LoginRequest, action: "approve" | "reject" | "delete", role?: UserRole) {
    setBusyId(`${request.requestId}_${action}_${role || ""}`);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Admin login required.");
      const response = await fetch("/api/admin/login-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId: request.requestId,
          action,
          role,
          password: passwords[request.requestId]?.trim() || undefined
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Action failed.");
      toast.success(action === "approve" ? `Approved ${request.gmail}` : action === "reject" ? "Request rejected" : "Request deleted");
      if (action === "approve") setPasswords((items) => ({ ...items, [request.requestId]: "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusyId("");
    }
  }

  const pending = requests.filter((request) => request.status === "pending");

  return (
    <ProtectedRoute adminOnly>
      <AppShell>
        <PageHeader title="Login Requests" description="Approve new access requests and create Firebase login accounts securely." />
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">{pending.length} pending requests</h2>
              <p className="mt-1 text-sm text-slate-500">Preferred passwords are visible only to admins on this screen.</p>
            </div>
          </div>
        </Card>
        <div className="mt-5 hidden overflow-hidden rounded-lg border border-white/70 bg-white/85 shadow-soft lg:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Gmail</th>
                <th className="px-4 py-3">Requested Role</th>
                <th className="px-4 py-3">Requested Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((request) => (
                <tr key={request.requestId}>
                  <td className="px-4 py-3 font-semibold">{request.fullName}</td>
                  <td className="px-4 py-3">{request.gmail}</td>
                  <td className="px-4 py-3">{request.requestedRole}</td>
                  <td className="px-4 py-3">{formatDate(request.createdAt)}</td>
                  <td className="px-4 py-3"><StatusPill status={request.status} /></td>
                  <td className="px-4 py-3"><Actions request={request} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!requests.length ? <p className="p-5 text-center text-sm text-slate-500">No login requests yet.</p> : null}
        </div>
        <div className="mt-5 grid gap-4 lg:hidden">
          {requests.map((request) => (
            <Card key={request.requestId}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{request.fullName}</p>
                  <p className="truncate text-sm text-slate-500">{request.gmail}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(request.createdAt)}</p>
                </div>
                <StatusPill status={request.status} />
              </div>
              <div className="mt-4">
                <Actions request={request} />
              </div>
            </Card>
          ))}
          {!requests.length ? <Card className="text-center text-sm text-slate-500">No login requests yet.</Card> : null}
        </div>
      </AppShell>
    </ProtectedRoute>
  );

  function Actions({ request }: { request: LoginRequest }) {
    const disabled = Boolean(busyId) || request.status !== "pending";
    return (
      <div className="grid gap-2 xl:grid-cols-[minmax(12rem,1fr)_auto_auto_auto_auto]">
        <div className="relative">
          <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            value={passwords[request.requestId] ?? request.preferredPassword}
            onChange={(event) => setPasswords((items) => ({ ...items, [request.requestId]: event.target.value }))}
            placeholder="Set custom password"
            disabled={request.status !== "pending"}
          />
        </div>
        <Button disabled={disabled} onClick={() => runAction(request, "approve", "user")}><UserCheck className="h-4 w-4" /> User</Button>
        <Button disabled={disabled} variant="secondary" onClick={() => runAction(request, "approve", "admin")}><Check className="h-4 w-4" /> Admin</Button>
        <Button disabled={disabled} variant="secondary" onClick={() => runAction(request, "reject")}><X className="h-4 w-4" /> Reject</Button>
        <Button disabled={Boolean(busyId)} variant="ghost" onClick={() => runAction(request, "delete")} aria-label="Delete request"><Trash2 className="h-4 w-4 text-red-600" /></Button>
      </div>
    );
  }
}

function StatusPill({ status }: { status: LoginRequest["status"] }) {
  const className = status === "pending" ? "bg-amber-100 text-amber-800" : status === "approved" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
  return <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}
