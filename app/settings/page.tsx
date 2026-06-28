"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword
} from "firebase/auth";
import {
  BookOpen,
  Camera,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Quote,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound
} from "lucide-react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { QuoteSettings } from "@/components/QuoteSettings";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { auth } from "@/lib/firebase";
import { useAcademicCatalog } from "@/lib/use-academic-catalog";
import type { ThemePreference } from "@/types/models";

type SettingsSection = "profile" | "appearance" | "academic" | "quotes" | "security" | "account";

const sections = [
  { id: "profile" as const, label: "Profile", icon: UserRound },
  { id: "appearance" as const, label: "Appearance", icon: Palette },
  { id: "academic" as const, label: "Academic preferences", icon: GraduationCap },
  { id: "quotes" as const, label: "Quotes", icon: Quote },
  { id: "security" as const, label: "Security", icon: ShieldCheck },
  { id: "account" as const, label: "Account", icon: LockKeyhole }
];

export default function SettingsPage() {
  const { appUser } = useAuth();
  const [section, setSection] = useState<SettingsSection>("profile");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("section") as SettingsSection | null;
    if (requested && sections.some((item) => item.id === requested)) setSection(requested);
  }, []);

  return (
    <ProtectedRoute>
      <AppShell>
        <PageHeader title="Settings" description="Manage your profile, academic preferences, appearance, quotes, and account security." />
        {appUser?.mustChangePassword ? (
          <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">Password change required</p>
            <p className="mt-1">Change the temporary password before using the rest of PadLEI.</p>
          </div>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:block lg:space-y-1" aria-label="Settings sections">
            {sections.map((item) => (
              <button
                key={item.id}
                className={`focus-ring flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold lg:w-full ${section === item.id ? "bg-ink text-white" : "bg-white text-slate-600"}`}
                onClick={() => setSection(item.id)}
                aria-current={section === item.id ? "page" : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="min-w-0">
            {section === "profile" ? <ProfileSection /> : null}
            {section === "appearance" ? <AppearanceSection /> : null}
            {section === "academic" ? <AcademicPreferencesSection /> : null}
            {section === "quotes" ? <QuoteSettings /> : null}
            {section === "security" ? <SecuritySection /> : null}
            {section === "account" ? <AccountSection /> : null}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

function ProfileSection() {
  const { appUser, refreshAppUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  if (!appUser) return null;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      await updateProfile({
        name: String(form.get("name") || ""),
        bio: String(form.get("bio") || ""),
        university: String(form.get("university") || ""),
        course: String(form.get("course") || ""),
        currentSemesterId: appUser?.currentSemesterId || ""
      });
      await refreshAppUser();
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) return toast.error("Choose a JPG, PNG, or WebP image.");
    if (file.size > 2 * 1024 * 1024) return toast.error("Profile photo must be 2 MB or smaller.");
    setPhotoBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Login required.");
      const signatureResponse = await fetch("/api/cloudinary/sign-profile-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType: file.type })
      });
      const signature = await signatureResponse.json() as {
        error?: string;
        apiKey?: string;
        publicId?: string;
        timestamp?: number;
        transformation?: string;
        signature?: string;
        uploadUrl?: string;
      };
      if (!signatureResponse.ok || !signature.uploadUrl || !signature.apiKey || !signature.publicId || !signature.signature) {
        throw new Error(signature.error || "Could not prepare profile upload.");
      }
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signature.apiKey);
      form.append("public_id", signature.publicId);
      form.append("timestamp", String(signature.timestamp));
      form.append("overwrite", "true");
      form.append("transformation", signature.transformation || "");
      form.append("signature", signature.signature);
      const uploadResponse = await fetch(signature.uploadUrl, { method: "POST", body: form });
      const uploaded = await uploadResponse.json() as { secure_url?: string; public_id?: string; error?: { message?: string } };
      if (!uploadResponse.ok || !uploaded.secure_url || !uploaded.public_id) {
        throw new Error(uploaded.error?.message || "Profile upload failed.");
      }
      await updateProfile({ profilePhotoUrl: uploaded.secure_url, profilePhotoPublicId: uploaded.public_id });
      await refreshAppUser();
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload profile photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink text-2xl font-bold text-white">
          {appUser.profilePhotoUrl ? <img className="h-full w-full object-cover" src={appUser.profilePhotoUrl} alt={`${appUser.name || "Student"} profile`} /> : initials(appUser.name || appUser.email)}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="focus-ring inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white">
            <Camera className="h-4 w-4" /> {photoBusy ? "Uploading..." : "Change photo"}
            <input className="hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void uploadPhoto(file);
            }} />
          </label>
          {appUser.profilePhotoUrl ? (
            <Button variant="danger" disabled={photoBusy} onClick={async () => {
              if (!window.confirm("Remove your profile photo?")) return;
              setPhotoBusy(true);
              try {
                await updateProfile({ removePhoto: true });
                await refreshAppUser();
                toast.success("Profile photo removed");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not remove photo.");
              } finally {
                setPhotoBusy(false);
              }
            }}><Trash2 className="h-4 w-4" /> Remove</Button>
          ) : null}
        </div>
      </div>
      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={saveProfile}>
        <Field label="Full name"><Input name="name" defaultValue={appUser.name} maxLength={100} required /></Field>
        <Field label="Email"><Input value={appUser.email} readOnly aria-readonly="true" /></Field>
        <Field label="University, optional"><Input name="university" defaultValue={appUser.university} maxLength={120} /></Field>
        <Field label="Course / program, optional"><Input name="course" defaultValue={appUser.course} maxLength={120} /></Field>
        <label className="block text-sm font-semibold sm:col-span-2">Bio, optional<Textarea className="mt-1" name="bio" defaultValue={appUser.bio} maxLength={300} /><span className="mt-1 block text-xs font-normal text-slate-500">Maximum 300 characters.</span></label>
        <div className="sm:col-span-2"><Button disabled={busy}>{busy ? "Saving..." : "Save profile"}</Button></div>
      </form>
    </Card>
  );
}

function AppearanceSection() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const options: Array<{ value: ThemePreference; label: string; icon: React.ElementType }> = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System default", icon: Monitor }
  ];
  return (
    <Card>
      <h2 className="font-bold">Appearance</h2>
      <p className="mt-1 text-sm text-slate-500">Theme changes apply immediately and sync to your PadLEI account.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {options.map((option) => (
          <button key={option.value} className={`focus-ring min-h-24 rounded-lg border p-4 text-left ${preference === option.value ? "border-aqua bg-aqua/10" : "border-slate-200 bg-white"}`} onClick={() => void setPreference(option.value)} aria-pressed={preference === option.value}>
            <option.icon className="h-5 w-5" />
            <span className="mt-3 block font-semibold">{option.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-500">Currently displayed in {resolvedTheme} mode.</p>
    </Card>
  );
}

function AcademicPreferencesSection() {
  const { appUser, refreshAppUser } = useAuth();
  const { semesters } = useAcademicCatalog();
  const [semesterId, setSemesterId] = useState(appUser?.currentSemesterId || "uncategorized");
  useEffect(() => setSemesterId(appUser?.currentSemesterId || "uncategorized"), [appUser?.currentSemesterId]);
  return (
    <Card>
      <BookOpen className="h-6 w-6 text-aqua" />
      <h2 className="mt-4 font-bold">Academic preferences</h2>
      <p className="mt-1 text-sm text-slate-500">Choose the semester PadLEI should prioritize in academic views.</p>
      <label className="mt-5 block text-sm font-semibold">
        Current semester
        <Select className="mt-1" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
          {semesters.map((semester) => <option key={semester.semesterId} value={semester.semesterId}>{semester.name}</option>)}
        </Select>
      </label>
      <Button className="mt-4" onClick={async () => {
        try {
          await updateProfile({ currentSemesterId: semesterId });
          await refreshAppUser();
          toast.success("Academic preference saved");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save preference.");
        }
      }}>Save preference</Button>
    </Card>
  );
}

function SecuritySection() {
  const { appUser, firebaseUser, logout, refreshAppUser } = useAuth();
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasPasswordProvider = firebaseUser?.providerData.some((provider) => provider.providerId === "password");

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseUser?.email) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") || "");
    const newPassword = String(data.get("newPassword") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");
    if (newPassword !== confirmPassword) return toast.error("New passwords do not match.");
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) return toast.error("Use at least 8 characters with uppercase, lowercase, and a number.");
    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      const token = await firebaseUser.getIdToken(true);
      await fetch("/api/account/password-changed", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      await refreshAppUser();
      form.reset();
      toast.success("Password changed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="font-bold">Password security</h2>
        {hasPasswordProvider ? (
          <form className="mt-4 space-y-3" onSubmit={changePassword}>
            <PasswordField label="Current password" name="currentPassword" visible={showPasswords} autoComplete="current-password" />
            <PasswordField label="New password" name="newPassword" visible={showPasswords} autoComplete="new-password" />
            <PasswordField label="Confirm new password" name="confirmPassword" visible={showPasswords} autoComplete="new-password" />
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input className="h-5 w-5" type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />{showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Show passwords</label>
            <p className="text-xs text-slate-500">Use at least 8 characters with uppercase, lowercase, and a number.</p>
            <Button disabled={busy}>{busy ? "Changing..." : "Change password"}</Button>
          </form>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-slate-600">This account currently uses Google sign-in. Firebase will email a secure password setup/reset link.</p>
            <Button className="mt-4" onClick={async () => {
              if (!firebaseUser?.email) return;
              await sendPasswordResetEmail(auth, firebaseUser.email);
              toast.success("Password setup email sent");
            }}>Send password setup email</Button>
          </div>
        )}
      </Card>
      <Card className="border-red-200">
        <h2 className="font-bold">Log out</h2>
        <p className="mt-1 text-sm text-slate-500">Your PadLEI data remains stored securely for your next login.</p>
        <Button className="mt-4" variant="danger" onClick={async () => {
          if (!window.confirm("Log out of PadLEI on this device?")) return;
          await logout();
        }}><LogOut className="h-4 w-4" /> Log out</Button>
      </Card>
      {appUser?.mustChangePassword ? <p className="text-sm text-amber-800">Normal app access resumes immediately after the required password change succeeds.</p> : null}
    </div>
  );
}

function AccountSection() {
  const { appUser } = useAuth();
  if (!appUser) return null;
  return (
    <Card>
      <h2 className="font-bold">Account</h2>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <Info label="Email" value={appUser.email} />
        <Info label="Role" value={appUser.role} />
        <Info label="Approval status" value={appUser.approved ? "Approved" : "Pending"} />
        <Info label="Account data owner" value="Connected across devices" />
      </dl>
    </Card>
  );
}

async function updateProfile(payload: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Login required.");
  const response = await fetch("/api/account/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Could not update profile.");
}

function PasswordField({ label, name, visible, autoComplete }: { label: string; name: string; visible: boolean; autoComplete: string }) {
  return <label className="block text-sm font-semibold">{label}<Input className="mt-1" name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required /></label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<div className="mt-1">{children}</div></label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "PL";
}
