"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./Button";

type Props = Omit<ComponentProps<"button">, "type"> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; icon?: ReactNode };

/**
 * Submit button that disables itself while its form is being sent, so a second click can't
 * send it twice. Works for server-action forms (useFormStatus) and plain POST forms (the
 * form's submit event; the button is disabled a tick later so its name/value still go out).
 */
export function SubmitButton({ variant = "primary", size = "md", icon, className, children, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  const [sent, setSent] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form || typeof form.action !== "string" || form.getAttribute("method")?.toLowerCase() !== "post") return;
    const onSubmit = () => setTimeout(() => setSent(true), 0);
    const onShow = () => setSent(false); // back/forward cache
    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onShow);
    return () => {
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
  const busy = pending || sent;
  return (
    <button ref={ref} type="submit" className={buttonClass(variant, size, className)} disabled={busy || disabled} aria-busy={busy || undefined} {...rest}>
      {icon}
      {children}
    </button>
  );
}
