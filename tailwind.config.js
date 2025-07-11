/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border, 220 13% 90%))",
        input: "hsl(var(--input, 220 13% 90%))",
        ring: "hsl(var(--ring, 240 100% 65%))",
        background: "hsl(var(--background, 220 15% 98%))",
        foreground: "hsl(var(--foreground, 220 15% 10%))",
        primary: {
          DEFAULT: "hsl(var(--primary, 240 100% 65%))",
          foreground: "hsl(var(--primary-foreground, 220 15% 98%))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary, 240 20% 90%))",
          foreground: "hsl(var(--secondary-foreground, 220 15% 10%))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive, 0 84% 60%))",
          foreground: "hsl(var(--destructive-foreground, 220 15% 98%))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted, 220 10% 95%))",
          foreground: "hsl(var(--muted-foreground, 220 10% 40%))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent, 240 30% 92%))",
          foreground: "hsl(var(--accent-foreground, 220 15% 10%))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover, 0 0% 100%))",
          foreground: "hsl(var(--popover-foreground, 220 15% 10%))",
        },
        card: {
          DEFAULT: "hsl(var(--card, 0 0% 100%))",
          foreground: "hsl(var(--card-foreground, 220 15% 10%))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}; 