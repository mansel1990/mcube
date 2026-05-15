import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#050505",   // Deep Charcoal / Void Black
        foreground: "#f8fafc",   // Off-white for readability
        primary:    "#2563EB",   // Electric Blue
        accent:     "#06B6D4",   // Cyber Cyan
        surface:    "#0F172A",   // Deep Slate for bento boxes
        muted:      "#64748B",   // Muted slate for secondary text
        border:     "#E2E8F0",   // Soft border (used in stocks section)
        success:    "#10B981",   // Emerald green
        danger:     "#EF4444",   // Red
        warning:    "#F59E0B",   // Amber
        champagne:  "#F2E3C6",   // Champagne Gold
      },
      backgroundImage: {
        'gradient-radial':  'radial-gradient(var(--tw-gradient-stops))',
        'glass-gradient':   'linear-gradient(108.8deg, rgba(255, 255, 255, 0.05) 0.6%, rgba(255, 255, 255, 0.01) 85.3%)',
        'hero-gradient':    'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
        'green-gradient':   'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'red-gradient':     'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        'amber-gradient':   'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
      boxShadow: {
        'card':  '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
        'glow-blue':   '0 0 20px rgba(37,99,235,0.2)',
        'glow-purple': '0 0 20px rgba(124,58,237,0.2)',
      }
    },
  },
  plugins: [],
};
export default config;
