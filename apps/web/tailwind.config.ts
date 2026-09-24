import type { Config } from "tailwindcss";

const v = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "\"Segoe UI\"", "Roboto", "\"Helvetica Neue\"", "Arial",
          "\"PingFang SC\"", "\"Hiragino Sans GB\"", "\"Noto Sans SC\"", "\"Noto Sans CJK SC\"", "\"Microsoft YaHei\"",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        background: v("background"),
        foreground: v("foreground"),
        card: { DEFAULT: v("card"), foreground: v("card-foreground") },
        muted: { DEFAULT: v("muted"), foreground: v("muted-foreground") },
        border: v("border"),
        input: v("input"),
        ring: v("ring"),
        primary: { DEFAULT: v("primary"), foreground: v("primary-foreground"), soft: v("primary-soft") },
        accent: { DEFAULT: v("accent"), foreground: v("accent-foreground"), soft: v("accent-soft") },
        gain: { DEFAULT: v("gain"), soft: v("gain-soft") },
        loss: { DEFAULT: v("loss"), soft: v("loss-soft") },
        warning: { DEFAULT: v("warning"), soft: v("warning-soft") },
        danger: { DEFAULT: v("danger"), soft: v("danger-soft") },
        success: { DEFAULT: v("success"), soft: v("success-soft") },
      },
      borderRadius: { xl: "1rem", "2xl": "1.25rem", lg: "0.75rem", md: "0.5rem" },
      boxShadow: {
        card: "0 1px 2px hsl(var(--shadow) / 0.06), 0 1px 3px hsl(var(--shadow) / 0.04)",
        pop: "0 10px 30px -10px hsl(var(--shadow) / 0.25), 0 4px 10px -4px hsl(var(--shadow) / 0.12)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        pulse2: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        highlight: { "0%": { backgroundColor: "hsl(var(--accent) / 0.35)" }, "100%": { backgroundColor: "transparent" } },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        pulse2: "pulse2 1.4s ease-in-out infinite",
        highlight: "highlight 2.2s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
