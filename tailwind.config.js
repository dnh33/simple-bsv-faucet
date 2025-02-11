/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "status-flash": {
          "0%, 100%": { opacity: "0" },
          "50%": { opacity: "0.1" },
        },
        "success-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.2" },
          "50%": { transform: "scale(1.5)", opacity: "0" },
        },
        "fail-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.2" },
          "50%": { transform: "scale(1.5)", opacity: "0" },
        },
        complete: {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fail: {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "status-flash": "status-flash 2s ease-in-out",
        "success-pulse": "success-pulse 2s ease-in-out infinite",
        "fail-pulse": "fail-pulse 2s ease-in-out infinite",
        complete: "complete 0.5s ease-out",
        fail: "fail 0.5s ease-out",
      },
    },
  },
  plugins: [],
};
