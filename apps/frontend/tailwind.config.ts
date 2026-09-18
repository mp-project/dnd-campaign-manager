import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      colors: {
        parchment: "#f8f1dd",
        ink: "#1b1b1a",
        ember: "#b24a2f",
        spruce: "#2f4f45",
      },
      boxShadow: {
        card: "0 14px 40px rgba(27, 27, 26, 0.15)",
      },
    },
  },
  plugins: [],
} satisfies Config;
