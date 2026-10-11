import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded font-medium no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer select-none whitespace-nowrap border";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink border-primary hover:bg-primary-hover hover:text-primary-ink",
  secondary: "bg-surface text-ink border-line-strong hover:border-ink hover:text-ink",
  ghost: "bg-transparent text-ink border-transparent hover:bg-primary-tint hover:text-primary",
  danger: "bg-surface text-danger border-danger hover:bg-danger-tint hover:text-danger"
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base"
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: ReactNode };
export function Button({ variant = "primary", size = "md", icon, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };
export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
