"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { Card } from "@/components/ui/card";
import type { AppUser, ExamResult, PdfFile } from "@/types/models";

export function AdminStats() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);

  useEffect(() => onSnapshot(collection(db, "users"), (snapshot) => setUsers(snapshot.docs.map((item) => item.data() as AppUser)), (error) => handleSnapshotError(error, "admin users")), []);
  useEffect(() => onSnapshot(collection(db, "pdfs"), (snapshot) => setPdfs(snapshot.docs.map((item) => item.data() as PdfFile)), (error) => handleSnapshotError(error, "admin PDFs")), []);
  useEffect(() => onSnapshot(collection(db, "examResults"), (snapshot) => setResults(snapshot.docs.map((item) => item.data() as ExamResult)), (error) => handleSnapshotError(error, "admin results")), []);

  const average = results.length ? Math.round(results.reduce((sum, item) => sum + item.percentage, 0) / results.length) : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Total users" value={users.length} />
      <Stat label="Uploaded PDFs" value={pdfs.length} />
      <Stat label="Exams attempted" value={results.length} />
      <Stat label="Average score" value={`${average}%`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card><p className="text-3xl font-bold">{value}</p><p className="text-sm text-slate-500">{label}</p></Card>;
}
