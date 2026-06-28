import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("focus-ring h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base text-ink placeholder:text-slate-400 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("focus-ring h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base text-ink sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn("focus-ring min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-ink placeholder:text-slate-400 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100", className)}
      {...props}
    />
  );
}
