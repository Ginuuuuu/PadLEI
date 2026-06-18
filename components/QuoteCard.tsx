"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { Plus, Quote as QuoteIcon, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { defaultQuotes } from "@/lib/default-quotes";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Quote } from "@/types/models";

export function QuoteCard() {
  const { appUser } = useAuth();
  const [custom, setCustom] = useState<Quote[]>([]);
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const quotes = useMemo(() => [...defaultQuotes, ...custom], [custom]);
  const quote = quotes[index % quotes.length];

  useEffect(() => {
    if (!appUser) return;
    return onSnapshot(
      query(collection(db, "quotes"), where("userId", "==", appUser.uid)),
      (snapshot) => {
        setCustom(snapshot.docs.map((item) => item.data() as Quote));
      },
      (error) => handleSnapshotError(error, "quotes")
    );
  }, [appUser]);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * Math.max(quotes.length, 1)));
    const timer = window.setInterval(() => setIndex((value) => value + 1), 7000);
    return () => window.clearInterval(timer);
  }, [quotes.length]);

  async function addQuote() {
    if (!appUser || !text.trim()) return;
    const quoteId = crypto.randomUUID();
    await setDoc(doc(db, "quotes", quoteId), { quoteId, userId: appUser.uid, text: text.trim(), type: "custom" });
    setText("");
    toast.success("Quote saved");
  }

  return (
    <Card className="bg-gradient-to-br from-white to-teal-50">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-aqua text-white">
          <QuoteIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-7">{quote?.text}</p>
          <p className="mt-1 text-sm text-slate-500">{quote?.author || "Your motivation board"}</p>
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Add your own quote" />
        <Button onClick={addQuote} aria-label="Add quote">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {custom.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {custom.slice(0, 4).map((item) => (
            <button key={item.quoteId} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600" onClick={() => deleteDoc(doc(db, "quotes", item.quoteId))}>
              {item.text.slice(0, 30)}
              <Trash2 className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
