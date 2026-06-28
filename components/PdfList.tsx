"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { BookOpen, ExternalLink, FileText, GraduationCap, RotateCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { auth, db } from "@/lib/firebase";
import { dataOwnerId } from "@/lib/account";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { PdfFile } from "@/types/models";

export function PdfList({ limit }: { limit?: number }) {
  const { appUser } = useAuth();
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser) return;
    setLoading(true);
    return onSnapshot(
      query(collection(db, "pdfs"), where("userId", "==", dataOwnerId(appUser))),
      (snapshot) => {
        setPdfs(snapshot.docs.map((item) => item.data() as PdfFile).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleSnapshotError(error, "PDFs");
      }
    );
  }, [appUser]);

  async function remove(pdf: PdfFile) {
    if (!confirm(`Delete ${pdf.fileName}?`)) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/delete-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ pdfId: pdf.pdfId })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Delete failed");
      toast.success("PDF deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete PDF", { duration: 8000 });
    }
  }

  async function reprocess(pdf: PdfFile) {
    if (!appUser) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ pdfId: pdf.pdfId, storagePath: pdf.storagePath, bucketName: pdf.bucketName })
      });
      const payload = (await response.json()) as { totalQuestions?: number; readyQuestions?: number; needsReview?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Extraction failed");
      toast.success(`Processed ${payload.totalQuestions || 0} questions: ${payload.readyQuestions || 0} ready, ${payload.needsReview || 0} need review.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reprocess PDF", { duration: 8000 });
    }
  }

  const items = typeof limit === "number" ? pdfs.slice(0, limit) : pdfs;

  if (loading) return <PdfSkeleton />;

  if (!items.length) {
    return <Card className="text-center text-sm text-slate-500">No PDFs yet. Upload a question paper to start studying.</Card>;
  }

  return (
    <div className="min-w-0">
      <div className="hidden gap-3 md:grid">
        {items.map((pdf) => {
          const counts = countsFor(pdf);
          return (
            <Card key={pdf.pdfId} className="p-0">
              <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-berry/10 text-berry">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink" title={pdf.fileName}>{pdf.fileName}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(pdf.uploadedAt)} · {pdf.storageProvider || "cloud"} storage</p>
                    </div>
                  </div>
                  <PdfMessage pdf={pdf} />
                </div>
                <div className="w-full xl:w-56">
                  <QuestionMetrics counts={counts} />
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:ml-auto xl:justify-end">
                  <StatusPill status={pdf.status} />
                  <ActionButtons counts={counts} pdf={pdf} onRemove={() => remove(pdf)} onReprocess={() => reprocess(pdf)} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="grid min-w-0 gap-4 md:hidden">
        {items.map((pdf) => {
          const counts = countsFor(pdf);
          return (
            <Card key={pdf.pdfId} className="min-w-0 overflow-hidden p-4">
              <div className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-berry/10 text-berry">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 break-words font-semibold leading-6" title={pdf.fileName}>{pdf.fileName}</h3>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(pdf.uploadedAt)}</p>
                </div>
              </div>
              <div className="mt-3 flex min-w-0 justify-start">
                <StatusPill status={pdf.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <Metric label="Total" value={counts.total} />
                <Metric label="Ready" value={counts.ready} />
                <Metric label="Review" value={counts.review} />
              </div>
              <PdfMessage pdf={pdf} />
              <div className="mt-5 grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <MobileActionButtons counts={counts} pdf={pdf} onRemove={() => remove(pdf)} onReprocess={() => reprocess(pdf)} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function countsFor(pdf: PdfFile) {
  const total = pdf.totalQuestions || 0;
  const review = pdf.needsReviewQuestions ?? 0;
  const ready = pdf.readyQuestions ?? Math.max(0, total - review);
  return { total, ready, review };
}

function QuestionMetrics({ counts }: { counts: ReturnType<typeof countsFor> }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-xs">
      <Metric label="Total" value={counts.total} />
      <Metric label="Ready" value={counts.ready} />
      <Metric label="Review" value={counts.review} />
    </div>
  );
}

function ActionButtons({
  counts,
  pdf,
  onRemove,
  onReprocess
}: {
  counts: ReturnType<typeof countsFor>;
  pdf: PdfFile;
  onRemove: () => void;
  onReprocess: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button className="h-10 px-3" variant="secondary" asChild>
        <Link href={`/pdfs/${pdf.pdfId}`}><ExternalLink className="h-4 w-4" /> Open</Link>
      </Button>
      <Button className="h-10 px-3" asChild>
        <Link href={`/study/${pdf.pdfId}`}><BookOpen className="h-4 w-4" /> Study</Link>
      </Button>
      {counts.ready > 0 ? (
        <Button className="h-10 px-3" variant="secondary" asChild>
          <Link href={`/exam/${pdf.pdfId}`}><GraduationCap className="h-4 w-4" /> Exam</Link>
        </Button>
      ) : (
        <Button className="h-10 px-3" variant="secondary" asChild>
          <Link href={`/pdfs/${pdf.pdfId}`}><GraduationCap className="h-4 w-4" /> Review</Link>
        </Button>
      )}
      <Button className="h-10 w-10 px-0" variant="secondary" onClick={onReprocess} aria-label="Retry extraction" title="Retry extraction">
        <RotateCw className="h-4 w-4" />
      </Button>
      <Button className="h-10 w-10 px-0" variant="danger" onClick={onRemove} aria-label="Delete PDF" title="Delete PDF">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function MobileActionButtons({
  counts,
  pdf,
  onRemove,
  onReprocess
}: {
  counts: ReturnType<typeof countsFor>;
  pdf: PdfFile;
  onRemove: () => void;
  onReprocess: () => void;
}) {
  return (
    <>
      <Button className="w-full min-w-0" variant="secondary" asChild><Link href={`/pdfs/${pdf.pdfId}`}><ExternalLink className="h-4 w-4" /> Open</Link></Button>
      <Button className="w-full min-w-0" asChild><Link href={`/study/${pdf.pdfId}`}><BookOpen className="h-4 w-4" /> Study</Link></Button>
      {counts.ready > 0 ? (
        <Button className="w-full min-w-0" variant="secondary" asChild><Link href={`/exam/${pdf.pdfId}`}><GraduationCap className="h-4 w-4" /> Exam</Link></Button>
      ) : (
        <Button className="w-full min-w-0" variant="secondary" asChild><Link href={`/pdfs/${pdf.pdfId}`}><GraduationCap className="h-4 w-4" /> Review</Link></Button>
      )}
      <Button className="w-full min-w-0" variant="secondary" onClick={onReprocess}><RotateCw className="h-4 w-4" /> Retry</Button>
      <Button className="w-full min-w-0 min-[420px]:col-span-2" variant="danger" onClick={onRemove}><Trash2 className="h-4 w-4" /> Delete PDF</Button>
    </>
  );
}

function StatusPill({ status }: { status: PdfFile["status"] }) {
  const color = status === "completed" ? "bg-green-100 text-green-800" : status === "failed" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${color}`}>{status}</span>;
}

function PdfMessage({ pdf }: { pdf: PdfFile }) {
  if (!pdf.errorMessage) return null;
  const color = pdf.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <p className={`mt-3 rounded-lg p-2 text-xs ${color}`}>{pdf.errorMessage}</p>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 rounded-lg bg-slate-50 p-2"><p className="font-bold text-ink">{value}</p><p className="truncate text-slate-500">{label}</p></div>;
}

function PdfSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-20 animate-pulse rounded-lg bg-white/70 shadow-soft" />
      ))}
    </div>
  );
}
