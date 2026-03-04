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
        background: "#050505", // Deep Charcoal / Void Black
        foreground: "#f8fafc", // Off-white for readability
        primary: "#2563EB", // Electric Blue
        accent: "#06B6D4", // Cyber Cyan
        surface: "#0F172A", // Deep Slate for bento boxes
        champagne: "#F2E3C6", // Champagne Gold for the Product side as requested
      },
      backgroundImage: {
         'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
         'glass-gradient': 'linear-gradient(108.8deg, rgba(255, 255, 255, 0.05) 0.6%, rgba(255, 255, 255, 0.01) 85.3%)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
    },
  },
  plugins: [],
};
export default config;
