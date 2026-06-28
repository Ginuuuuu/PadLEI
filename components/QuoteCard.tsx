"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { Quote as QuoteIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/ui/card";
import { dataOwnerId } from "@/lib/account";
import { defaultQuotes } from "@/lib/default-quotes";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import type { Quote, UserPreferences } from "@/types/models";

export function QuoteCard() {
  const { appUser } = useAuth();
  const [custom, setCustom] = useState<Quote[]>([]);
  const [show, setShow] = useState(true);
  const [index, setIndex] = useState(0);
  const quotes = useMemo(() => [...defaultQuotes, ...custom], [custom]);
  const quote = quotes[index % Math.max(quotes.length, 1)];

  useEffect(() => {
    if (!appUser) return;
    const ownerId = dataOwnerId(appUser);
    const unsubscribeQuotes = onSnapshot(
      query(collection(db, "quotes"), where("userId", "==", ownerId)),
      (snapshot) => setCustom(snapshot.docs.map((item) => item.data() as Quote)),
      (error) => handleSnapshotError(error, "quotes")
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

  useEffect(() => {
    setIndex(Math.floor(Math.random() * Math.max(quotes.length, 1)));
    const timer = window.setInterval(() => setIndex((value) => value + 1), 7000);
    return () => window.clearInterval(timer);
  }, [quotes.length]);

  if (!show || !quote) return null;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-aqua text-white">
          <QuoteIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-7">{quote.text}</p>
          <p className="mt-1 text-sm text-slate-500">{quote.author || "PadLEI motivation"}</p>
        </div>
      </div>
    </Card>
  );
}
