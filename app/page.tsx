"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Mail, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const googleTimeoutMessage = "Google login did not finish. Allow popups for this site, close any old Google popup, then try again.";

export default function LoginPage() {
  const router = useRouter();
  const { loginWithGoogle, loginWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [nativeMobileApp, setNativeMobileApp] = useState(false);

  useEffect(() => {
    setNativeMobileApp(window.navigator.userAgent.includes("PadLEIAndroid") || window.navigator.userAgent.includes("PadLEIiOS"));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setEmailBusy(true);
    try {
      await loginWithEmail(email, password);
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Access denied. New users must request login access from Admin.";
      setLoginError(message);
      toast.error(message);
    } finally {
      setEmailBusy(false);
    }
  }

  async function google() {
    setGoogleBusy(true);
    try {
      await withTimeout(loginWithGoogle(), 25000, googleTimeoutMessage);
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : googleTimeoutMessage;
      setLoginError(message);
      toast.error(message);
    } finally {
      setGoogleBusy(false);
    }
  }

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") || "").trim();
    const gmail = String(form.get("gmail") || "").toLowerCase().trim();
    const preferredPassword = String(form.get("preferredPassword") || "").trim();
    const confirmPassword = String(form.get("confirmPassword") || "").trim();

    if (!fullName || !gmail || !preferredPassword || !confirmPassword) return toast.error("All fields are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail)) return toast.error("Enter a valid Gmail address.");
    if (preferredPassword.length < 6) return toast.error("Password must be at least 6 characters.");
    if (preferredPassword !== confirmPassword) return toast.error("Passwords must match.");

    setRequestBusy(true);
    try {
      const response = await fetch("/api/login-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, gmail, preferredPassword, confirmPassword })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not submit request.");

      const message = `Hello Admin, I am requesting login access.\n\nName: ${fullName}\nGmail: ${gmail}\nPreferred Password: ${preferredPassword}\n\nPlease approve my account.`;
      window.open(`https://wa.me/918807905821?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      toast.success("Request sent. WhatsApp opened for admin notification.");
      setRequestOpen(false);
      event.currentTarget.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit request.");
    } finally {
      setRequestBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="glass w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-ink text-white">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">PadLEI</h1>
          <p className="mt-2 text-sm text-slate-600">Approved students can study PDFs, practice MCQs, and track exam progress.</p>
        </div>
        {nativeMobileApp ? (
          <div className="mt-6 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Use email and password to log in from the mobile app.
          </div>
        ) : (
          <Button className="mt-6 w-full" variant="secondary" disabled={googleBusy || emailBusy} onClick={google}>
            <GoogleIcon /> {googleBusy ? "Opening Google..." : "Continue with Google"}
          </Button>
        )}
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <Button className="w-full" disabled={emailBusy || googleBusy}>{emailBusy ? "Checking access..." : "Login"}</Button>
        </form>
        {loginError ? (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <p>{loginError.includes("Access denied") ? "Access denied. New users must request login access from Admin." : loginError}</p>
          </div>
        ) : null}
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-center">
          <p className="text-sm font-semibold text-ink">Need access? Contact admin</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <a className="focus-ring grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-aqua hover:text-aqua" href="https://mail.google.com/mail/?view=cm&fs=1&to=reshin0026@gmail.com" target="_blank" rel="noreferrer" aria-label="Contact admin by Gmail" title="Gmail">
              <Mail className="h-5 w-5" />
            </a>
            <a className="focus-ring grid h-11 w-11 place-items-center rounded-lg border border-green-100 bg-[#25D366] text-white transition hover:bg-[#1ebe5d]" href="https://wa.me/918807905821" target="_blank" rel="noreferrer" aria-label="Contact admin on WhatsApp" title="WhatsApp">
              <WhatsAppIcon />
            </a>
          </div>
          <Button className="mt-4 w-full" variant="secondary" onClick={() => setRequestOpen(true)}>Request Login Access</Button>
          <p className="mt-4 text-xs font-semibold text-slate-500">Developer: Ginu</p>
        </div>
      </Card>
      {requestOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4 py-6 backdrop-blur-sm">
          <Card className="w-full max-w-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Request Login Access</h2>
                <p className="mt-1 text-sm text-slate-500">Your request goes to Admin for approval.</p>
              </div>
              <Button className="h-11 w-11 px-0" variant="ghost" onClick={() => setRequestOpen(false)} aria-label="Close request form">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form className="mt-5 space-y-3" onSubmit={requestAccess}>
              <Input name="fullName" placeholder="Full Name" required />
              <Input name="gmail" type="email" placeholder="Gmail" required />
              <Input name="preferredPassword" type="password" placeholder="Preferred Password" minLength={6} required />
              <Input name="confirmPassword" type="password" placeholder="Confirm Password" minLength={6} required />
              <Button className="w-full" disabled={requestBusy}>{requestBusy ? "Submitting..." : "Submit Request"}</Button>
            </form>
          </Card>
        </div>
      ) : null}
    </main>
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7Z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.4 39.6 16.2 44 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.3 4.3-4.1 5.6l6.2 5.2C36.9 39.3 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M16.04 3.2A12.74 12.74 0 0 0 5.18 22.6L3.7 28.8l6.35-1.44A12.75 12.75 0 1 0 16.04 3.2Zm0 2.28a10.47 10.47 0 1 1 0 20.94 10.35 10.35 0 0 1-5.32-1.46l-.5-.3-3.38.77.8-3.3-.33-.52A10.47 10.47 0 0 1 16.04 5.48Zm-4.4 5.55c-.24 0-.62.08-.94.44-.33.36-1.24 1.2-1.24 2.94s1.27 3.42 1.45 3.66c.18.24 2.46 3.94 6.08 5.36 3.01 1.18 3.63.95 4.28.9.66-.05 2.12-.86 2.42-1.69.3-.83.3-1.54.2-1.69-.09-.15-.33-.24-.7-.42-.36-.18-2.12-1.05-2.45-1.17-.33-.12-.57-.18-.8.18-.24.36-.93 1.17-1.14 1.4-.21.24-.42.27-.78.09-.36-.18-1.52-.56-2.9-1.78-1.07-.96-1.8-2.14-2.01-2.5-.21-.36-.02-.56.16-.74.16-.16.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.8-1.94-1.1-2.66-.29-.7-.59-.6-.8-.61l-.68-.02Z" />
    </svg>
  );
}
