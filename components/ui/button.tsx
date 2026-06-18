import { ButtonHTMLAttributes, ReactElement, cloneElement } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  asChild?: boolean;
};

export function Button({ className, variant = "primary", asChild, children, ...props }: Props) {
  const variants = {
    primary: "bg-ink text-white hover:bg-ink/90",
    secondary: "bg-white text-ink border border-slate-200 hover:bg-slate-50",
    ghost: "bg-transparent text-ink hover:bg-white/70",
    danger: "bg-red-600 text-white hover:bg-red-700"
  };

  const classes = cn(
    "focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    className
  );

  if (asChild && children) {
    return cloneElement(children as ReactElement<{ className?: string }>, {
      className: cn(classes, (children as ReactElement<{ className?: string }>).props.className)
    });
  }

  return <button className={classes} {...props}>{children}</button>;
}
