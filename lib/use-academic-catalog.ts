"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { academicId, normalizeAcademicName, semesterPresets } from "@/lib/academic";
import { dataOwnerId } from "@/lib/account";
import { db } from "@/lib/firebase";
import { handleSnapshotError } from "@/lib/firestore-errors";
import type { Semester, Subject } from "@/types/models";

export function useAcademicCatalog() {
  const { appUser } = useAuth();
  const [storedSemesters, setStoredSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    if (!appUser) return;
    const ownerId = dataOwnerId(appUser);
    const unsubscribeSemesters = onSnapshot(
      query(collection(db, "semesters"), where("userId", "==", ownerId)),
      (snapshot) => setStoredSemesters(snapshot.docs.map((item) => item.data() as Semester)),
      (error) => handleSnapshotError(error, "semesters")
    );
    const unsubscribeSubjects = onSnapshot(
      query(collection(db, "subjects"), where("userId", "==", ownerId)),
      (snapshot) => setSubjects(snapshot.docs.map((item) => item.data() as Subject)),
      (error) => handleSnapshotError(error, "subjects")
    );
    return () => {
      unsubscribeSemesters();
      unsubscribeSubjects();
    };
  }, [appUser]);

  const semesters = useMemo(() => {
    const presets: Semester[] = semesterPresets.map((semester) => ({
      ...semester,
      userId: appUser ? dataOwnerId(appUser) : "",
      normalizedName: normalizeAcademicName(semester.name),
      isCustom: false,
      createdAt: "",
      updatedAt: ""
    }));
    const byName = new Map(presets.map((semester) => [semester.normalizedName, semester]));
    for (const semester of storedSemesters) byName.set(semester.normalizedName, semester);
    return [...byName.values()].sort((a, b) => semesterSort(a.name) - semesterSort(b.name) || a.name.localeCompare(b.name));
  }, [appUser, storedSemesters]);

  const addSemester = useCallback(async (name: string) => {
    if (!appUser) throw new Error("Login required.");
    const normalizedName = normalizeAcademicName(name);
    if (!normalizedName) throw new Error("Semester name is required.");
    if (semesters.some((semester) => semester.normalizedName === normalizedName)) {
      throw new Error("That semester already exists.");
    }
    const ownerId = dataOwnerId(appUser);
    const semesterId = `custom-${academicId(name)}`;
    const now = new Date().toISOString();
    const semester: Semester = {
      semesterId,
      userId: ownerId,
      name: name.trim().replace(/\s+/g, " "),
      normalizedName,
      isCustom: true,
      createdAt: now,
      updatedAt: now
    };
    await setDoc(doc(db, "semesters", `${ownerId}_${semesterId}`), semester);
    return semester;
  }, [appUser, semesters]);

  const addSubject = useCallback(async (semester: Pick<Semester, "semesterId" | "name">, name: string, isCustom = true) => {
    if (!appUser) throw new Error("Login required.");
    const normalizedName = normalizeAcademicName(name);
    if (!normalizedName) throw new Error("Subject name is required.");
    if (subjects.some((subject) => subject.semesterId === semester.semesterId && subject.normalizedName === normalizedName)) {
      return subjects.find((subject) => subject.semesterId === semester.semesterId && subject.normalizedName === normalizedName)!;
    }
    const ownerId = dataOwnerId(appUser);
    const subjectId = academicId(name);
    const now = new Date().toISOString();
    const subject: Subject = {
      subjectId,
      userId: ownerId,
      semesterId: semester.semesterId,
      semesterName: semester.name,
      name: name.trim().replace(/\s+/g, " "),
      normalizedName,
      isCustom,
      createdAt: now,
      updatedAt: now
    };
    await setDoc(doc(db, "subjects", `${ownerId}_${semester.semesterId}_${subjectId}`), subject);
    return subject;
  }, [appUser, subjects]);

  return { semesters, subjects, addSemester, addSubject };
}

function semesterSort(name: string) {
  if (name === "Uncategorized") return 999;
  const match = name.match(/\d+/);
  return match ? Number(match[0]) : 500;
}
