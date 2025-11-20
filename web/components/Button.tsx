import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

const base =
  "rounded px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70";

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const variantClass = {
    primary: "border border-sky-400/60 bg-sky-500/80 text-slate-900 hover:bg-sky-400",
    secondary:
      "border border-slate-200/20 text-slate-200 hover:border-slate-100/30 hover:bg-slate-800/60",
    ghost: "text-slate-300 hover:text-slate-100",
  }[variant];

  return <button className={`${base} ${variantClass} ${className}`} {...props} />;
}

