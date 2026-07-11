import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ajs: {
          bg: "#0F1117",
          surface: "#1A1D27",
          border: "#2A2D3A",
          primary: "#F0F2F5",
          secondary: "#8B90A0",
          accent: "#2563EB",
          high: "#EF4444",
          medium: "#F59E0B",
          low: "#6B7280",
          success: "#10B981",
        },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"] },
      boxShadow: { panel: "0 16px 40px rgb(0 0 0 / 0.18)" },
    },
  },
  plugins: [],
};

export default config;
