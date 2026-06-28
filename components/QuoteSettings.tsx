"use client";

import { FormEvent, useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { dataOwnerId } from "@/lib/account";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import type { Quote, UserPreferences } from "@/types/models";

export function QuoteSettings() {
  const { appUser } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [show, setShow] = useState(true);
  const [editing, setEditing] = useState<Quote | null>(null);

  useEffect(() => {
    if (!appUser) return;
    const ownerId = dataOwnerId(appUser);
    const unsubscribeQuotes = onSnapshot(
      query(collection(db, "quotes"), where("userId", "==", ownerId)),
      (snapshot) => setQuotes(snapshot.docs.map((item) => item.data() as Quote)),
      (error) => handleSnapshotError(error, "quote settings")
    );
    const unsubscribePreferences = onSnapshot(
      doc(db, "userPreferences", ownerId),
      (snapshot) => setShow(snapshot.exists() ? (snapshot.data() as UserPreferences).showDashboardQuote !== false : true),
      (error) => handleSnapshotError(error, "quote preferences")
    );
    return () => {
      unsubscribeQuotes();
      unsubscribePreferences();
    };
  }, [appUser]);

  async function setQuoteVisibility(next: boolean) {
    if (!appUser) return;
    setShow(next);
    await setDoc(doc(db, "userPreferences", dataOwnerId(appUser)), {
      userId: dataOwnerId(appUser),
      themePreference: appUser.themePreference || "system",
      showDashboardQuote: next,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }

  async function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appUser) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get("text") || "").trim();
    const author = String(data.get("author") || "").trim();
    if (!text) return toast.error("Quote text is required.");
    const quoteId = editing?.quoteId || crypto.randomUUID();
    await setDoc(doc(db, "quotes", quoteId), {
      quoteId,
      userId: dataOwnerId(appUser),
      text: text.slice(0, 300),
      ...(author ? { author: author.slice(0, 80) } : {}),
      type: "custom"
    });
    setEditing(null);
    form.reset();
    toast.success(editing ? "Quote updated" : "Quote added");
  }

  async function restoreDefaults() {
    if (!appUser || !window.confirm("Remove custom quotes and restore the default dashboard quote behavior?")) return;
    await Promise.all(quotes.map((quote) => deleteDoc(doc(db, "quotes", quote.quoteId))));
    await setQuoteVisibility(true);
    toast.success("Default quote behavior restored");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <h2 className="font-bold">{editing ? "Edit custom quote" : "Add custom quote"}</h2>
        <form className="mt-4 space-y-3" onSubmit={saveQuote}>
          <label className="block text-sm font-semibold">Quote<Textarea className="mt-1" name="text" defaultValue={editing?.text} maxLength={300} required /></label>
          <label className="block text-sm font-semibold">Author, optional<Input className="mt-1" name="author" defaultValue={editing?.author} maxLength={80} /></label>
          <div className="flex flex-wrap gap-2">
            <Button><Plus className="h-4 w-4" /> {editing ? "Save changes" : "Add quote"}</Button>
            {editing ? <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button> : null}
          </div>
        </form>
      </Card>
      <div className="space-y-4">
        <Card>
          <label className="flex min-h-11 items-center justify-between gap-4">
            <span><span className="block font-semibold">Show quote on dashboard</span><span className="mt-1 block text-sm text-slate-500">The quote card is removed completely when disabled.</span></span>
            <input className="h-5 w-5" type="checkbox" checked={show} onChange={(event) => void setQuoteVisibility(event.target.checked)} />
          </label>
        </Card>
        <Button className="w-full" variant="secondary" onClick={() => void restoreDefaults()}><RotateCcw className="h-4 w-4" /> Restore defaults</Button>
      </div>
      <div className="grid gap-3 lg:col-span-2 sm:grid-cols-2">
        {quotes.map((quote) => (
          <Card key={quote.quoteId}>
            <p className="font-semibold leading-6">{quote.text}</p>
            <p className="mt-1 text-sm text-slate-500">{quote.author || "No author"}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(quote)}><Pencil className="h-4 w-4" /> Edit</Button>
              <Button className="h-11 w-11 px-0" variant="ghost" onClick={() => {
                if (window.confirm("Delete this quote?")) void deleteDoc(doc(db, "quotes", quote.quoteId));
              }} aria-label="Delete quote"><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
