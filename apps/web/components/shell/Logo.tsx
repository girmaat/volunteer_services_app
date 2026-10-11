import Link from "next/link";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <path d="M14 6h36a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H30l-12 9v-9h-4a8 8 0 0 1-8-8V14a8 8 0 0 1 8-8z" fill="var(--primary)" />
      <path d="M32 41s-11-6.6-11-13.4c0-3.6 2.8-6.1 6-6.1 2.2 0 3.9 1.2 5 2.8 1.1-1.6 2.8-2.8 5-2.8 3.2 0 6 2.5 6 6.1C43 34.4 32 41 32 41z" fill="#fff" />
      <circle cx="49" cy="15" r="5" fill="var(--sun)" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link prefetch={false} href={href} className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink hover:text-ink" aria-label="ThankYou home">
      <LogoMark />
      <span>ThankYou</span>
    </Link>
  );
}
