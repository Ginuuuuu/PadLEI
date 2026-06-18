import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#162033",
        mist: "#f7fafc",
        aqua: "#0ea5a4",
        berry: "#8b5cf6",
        leaf: "#16a34a"
      },
      boxShadow: {
        soft: "0 16px 45px rgba(30, 41, 59, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
