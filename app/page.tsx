"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Instagram, Mail } from "lucide-react";
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setEmailBusy(true);
    try {
      await loginWithEmail(email, password);
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Access denied. Please contact admin for login access.");
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
      toast.error(error instanceof Error ? error.message : googleTimeoutMessage);
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="glass w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-ink text-white">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Study + Mock Test Platform</h1>
          <p className="mt-2 text-sm text-slate-600">Approved students can study PDFs, practice MCQs, and track exam progress.</p>
        </div>
        <Button className="mt-6 w-full" variant="secondary" disabled={googleBusy || emailBusy} onClick={google}>
          <GoogleIcon /> {googleBusy ? "Opening Google..." : "Continue with Google"}
        </Button>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <Button className="w-full" disabled={emailBusy || googleBusy}>{emailBusy ? "Checking access..." : "Login"}</Button>
        </form>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-center">
          <p className="text-sm font-semibold text-ink">Need access? Contact admin</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <a className="focus-ring grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-aqua hover:text-aqua" href="https://mail.google.com/mail/?view=cm&fs=1&to=reshin0026@gmail.com" target="_blank" rel="noreferrer" aria-label="Contact admin by Gmail" title="Gmail">
              <Mail className="h-5 w-5" />
            </a>
            <a className="focus-ring grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-berry hover:text-berry" href="https://instagram.com/reshin.___" target="_blank" rel="noreferrer" aria-label="Contact admin on Instagram" title="Instagram">
              <Instagram className="h-5 w-5" />
            </a>
            <a className="focus-ring grid h-11 w-11 place-items-center rounded-lg border border-green-100 bg-[#25D366] text-white transition hover:bg-[#1ebe5d]" href="https://wa.me/918807905821" target="_blank" rel="noreferrer" aria-label="Contact admin on WhatsApp" title="WhatsApp">
              <WhatsAppIcon />
            </a>
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-500">Developer: Ginu</p>
        </div>
      </Card>
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
