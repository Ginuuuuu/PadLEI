"use client";

import { FormEvent, useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { auth, db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import type { AppUser, UserApproval, UserRole } from "@/types/models";

export default function AdminUsersPage() {
  const { appUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [approvals, setApprovals] = useState<UserApproval[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "users"), (snapshot) => setUsers(snapshot.docs.map((item) => item.data() as AppUser)), (error) => handleSnapshotError(error, "users"));
  }, [appUser]);
  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "approvals"), (snapshot) => setApprovals(snapshot.docs.map((item) => item.data() as UserApproval)), (error) => handleSnapshotError(error, "approvals"));
  }, [appUser]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").toLowerCase().trim();
    const role = String(form.get("role") || "user") as UserRole;
    const password = String(form.get("password") || "").trim();
    if (!email) return;
    setBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Admin login required.");
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email, role, password: password || undefined })
      });
      const payload = (await response.json()) as { error?: string; temporaryPassword?: string; email?: string };
      if (!response.ok) throw new Error(payload.error || "Could not create user.");
      setTemporaryPassword({ email: payload.email || email, password: payload.temporaryPassword || password });
      event.currentTarget.reset();
      toast.success("Firebase Auth user created and approved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create user.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(user: AppUser, role: UserRole) {
    const updatedAt = new Date().toISOString();
    await updateDoc(doc(db, "users", user.uid), { role, updatedAt });
    await setDoc(doc(db, "approvals", user.email), { email: user.email, role, approved: user.approved, createdAt: user.createdAt || updatedAt, updatedAt }, { merge: true });
  }

  async function toggleApproval(user: AppUser) {
    const approved = !user.approved;
    const updatedAt = new Date().toISOString();
    await updateDoc(doc(db, "users", user.uid), { approved, updatedAt });
    await setDoc(doc(db, "approvals", user.email), { email: user.email, role: user.role, approved, createdAt: user.createdAt || updatedAt, updatedAt }, { merge: true });
  }

  async function removeUser(user: AppUser) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", user.uid));
    batch.delete(doc(db, "approvals", user.email));
    await batch.commit();
  }

  const realUsers = users
    .filter((user) => !user.uid.startsWith("pending_"))
    .sort((a, b) => a.email.localeCompare(b.email));
  const realUserEmails = new Set(realUsers.map((user) => user.email));
  const pendingApprovals = approvals.filter((approval) => !realUserEmails.has(approval.email)).sort((a, b) => a.email.localeCompare(b.email));

  return (
    <ProtectedRoute adminOnly>
      <AppShell>
        <PageHeader title="Admin Users" description="Add an email here to create the Firebase Authentication account and approve platform access in one step." />
        <Card>
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-900">
            This creates the login account automatically. Leave password blank to generate a temporary password.
          </div>
          {temporaryPassword ? (
            <div className="mb-4 rounded-lg border border-aqua/30 bg-aqua/10 p-3 text-sm text-ink">
              <p className="font-semibold">Temporary login for {temporaryPassword.email}</p>
              <p className="mt-1 font-mono text-base">{temporaryPassword.password}</p>
              <p className="mt-1 text-xs text-slate-600">Share this password with the user. They can change it later in Firebase/Auth flow.</p>
            </div>
          ) : null}
          <form className="grid gap-3 lg:grid-cols-[1fr_12rem_14rem_auto]" onSubmit={add}>
            <Input name="email" type="email" placeholder="student@example.com" required />
            <Select name="role" defaultValue="user"><option value="user">User</option><option value="admin">Admin</option></Select>
            <Input name="password" type="text" placeholder="Password or auto-generate" minLength={6} />
            <Button disabled={busy}>{busy ? "Creating..." : "Create user"}</Button>
          </form>
        </Card>
        <div className="mt-5 space-y-3">
          {realUsers.map((user) => (
            <Card key={user.uid} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{user.email}</p>
                <p className="text-sm text-slate-500">{user.uid}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={user.role} onChange={(event) => updateRole(user, event.target.value as UserRole)}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </Select>
                <Button variant={user.approved ? "secondary" : "primary"} onClick={() => toggleApproval(user)}>
                  {user.approved ? "Approved" : "Approve"}
                </Button>
                <Button variant="ghost" onClick={() => removeUser(user)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
            </Card>
          ))}
          {pendingApprovals.map((approval) => (
            <Card key={approval.email} className="flex flex-wrap items-center justify-between gap-3 border-dashed">
              <div>
                <p className="font-semibold">{approval.email}</p>
                <p className="text-sm text-slate-500">Approved by email. Waiting for Firebase Authentication account or first Google login.</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={approval.role} onChange={(event) => setDoc(doc(db, "approvals", approval.email), { ...approval, role: event.target.value as UserRole }, { merge: true })}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </Select>
                <Button variant="secondary">Approved</Button>
                <Button variant="ghost" onClick={() => deleteDoc(doc(db, "approvals", approval.email))}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
            </Card>
          ))}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
