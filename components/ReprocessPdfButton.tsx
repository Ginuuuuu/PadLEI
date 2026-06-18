"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import toast from "react-hot-toast";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

export function ReprocessPdfButton({ pdfId, className }: { pdfId: string; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function reprocess() {
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Login required.");
      const response = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ pdfId })
      });
      const payload = (await response.json()) as { totalQuestions?: number; needsReview?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Reprocess failed.");
      toast.success(`Reprocessed ${payload.totalQuestions || 0} questions`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reprocess PDF", { duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button className={className} variant="secondary" disabled={busy} onClick={reprocess}>
      <RotateCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Reprocessing..." : "Reprocess PDF"}
    </Button>
  );
}
