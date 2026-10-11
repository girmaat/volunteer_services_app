import type { Config } from "tailwindcss";

/**
 * Design tokens live as CSS variables in app/globals.css (so legacy CSS modules share them);
 * Tailwind maps utilities onto the same variables.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // Preflight is off so untouched legacy pages keep their layout; base styles live in globals.css.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        paper: "var(--paper)",
        surface: "var(--surface)",
        wash: "var(--muted-bg)",
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        muted: "var(--muted)",
        primary: { DEFAULT: "var(--primary)", hover: "var(--primary-hover)", tint: "var(--primary-tint)", ink: "var(--primary-ink)" },
        sun: { DEFAULT: "var(--sun)", tint: "var(--sun-tint)" },
        danger: { DEFAULT: "var(--danger)", tint: "var(--danger-tint)" },
        warning: { DEFAULT: "var(--warning)", tint: "var(--warning-tint)" },
        success: { DEFAULT: "var(--success)", tint: "var(--success-tint)" }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-jakarta)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.25rem" }],
        sm: ["0.875rem", { lineHeight: "1.35rem" }],
        base: ["1rem", { lineHeight: "1.6rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
        xl: ["1.5625rem", { lineHeight: "2rem", letterSpacing: "-0.01em" }],
        "2xl": ["1.9375rem", { lineHeight: "2.35rem", letterSpacing: "-0.015em" }],
        "3xl": ["2.4375rem", { lineHeight: "2.85rem", letterSpacing: "-0.02em" }],
        "4xl": ["3.0625rem", { lineHeight: "3.4rem", letterSpacing: "-0.025em" }]
      },
      borderRadius: { sm: "6px", DEFAULT: "8px", md: "10px", lg: "14px" },
      maxWidth: { content: "1080px", prose: "68ch" },
      boxShadow: { pop: "0 8px 28px rgba(23, 36, 47, 0.14)" }
    }
  },
  plugins: []
};
export default config;
