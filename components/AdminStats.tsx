"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/ui/card";
import type { ActualExamScore, AppUser, ExamResult, ExamTimetableEntry, LoginRequest, PdfFile } from "@/types/models";

export function AdminStats() {
  const { appUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [requests, setRequests] = useState<LoginRequest[]>([]);
  const [timetable, setTimetable] = useState<ExamTimetableEntry[]>([]);
  const [scores, setScores] = useState<ActualExamScore[]>([]);

  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "users"), (snapshot) => setUsers(snapshot.docs.map((item) => item.data() as AppUser)), (error) => handleSnapshotError(error, "admin users"));
  }, [appUser]);
  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "loginRequests"), (snapshot) => setRequests(snapshot.docs.map((item) => item.data() as LoginRequest)), (error) => handleSnapshotError(error, "admin login requests"));
  }, [appUser]);
  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "examTimetable"), (snapshot) => setTimetable(snapshot.docs.map((item) => item.data() as ExamTimetableEntry)), (error) => handleSnapshotError(error, "admin timetable"));
  }, [appUser]);
  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "actualExamScores"), (snapshot) => setScores(snapshot.docs.map((item) => item.data() as ActualExamScore)), (error) => handleSnapshotError(error, "admin scores"));
  }, [appUser]);
  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "pdfs"), (snapshot) => setPdfs(snapshot.docs.map((item) => item.data() as PdfFile)), (error) => handleSnapshotError(error, "admin PDFs"));
  }, [appUser]);
  useEffect(() => {
    if (appUser?.role !== "admin") return;
    return onSnapshot(collection(db, "examResults"), (snapshot) => setResults(snapshot.docs.map((item) => item.data() as ExamResult)), (error) => handleSnapshotError(error, "admin results"));
  }, [appUser]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Stat label="Approved users" value={users.filter((user) => user.approved).length} />
      <Stat label="Pending requests" value={requests.filter((request) => request.status === "pending").length} />
      <Stat label="Uploaded PDFs" value={pdfs.length} />
      <Stat label="Mock attempts" value={results.length} />
      <Stat label="Timetable entries" value={timetable.length} />
      <Stat label="Actual scores" value={scores.length} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card><p className="text-3xl font-bold">{value}</p><p className="text-sm text-slate-500">{label}</p></Card>;
}
