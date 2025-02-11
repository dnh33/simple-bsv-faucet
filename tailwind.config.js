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
        "splash-wave": {
          "0%, 100%": { transform: "rotate3d(1, 2, 1, 45deg) scale(1)" },
          "50%": { transform: "rotate3d(1, 2, 1, 45deg) scale(1.2)" },
        },
        "droplet-base": {
          "0%": { transform: "translateY(0) scale(1)", opacity: "0.6" },
          "50%": { transform: "translateY(-20px) scale(0.8)", opacity: "0.8" },
          "100%": { transform: "translateY(-40px) scale(0.6)", opacity: "0" },
        },
        ripple: {
          "0%": { transform: "scale(0.8)", opacity: "0.8" },
          "100%": { transform: "scale(2)", opacity: "0" },
        },
        "perspective-shift": {
          "0%, 100%": { transform: "rotate3d(2, 1, 1, 60deg) scale(1.5)" },
          "50%": { transform: "rotate3d(2, 1, 1, 65deg) scale(1.6)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-20px) scale(1.05)" },
        },
      },
      animation: {
        "status-flash": "status-flash 2s ease-in-out",
        "success-pulse": "success-pulse 2s ease-in-out infinite",
        "fail-pulse": "fail-pulse 2s ease-in-out infinite",
        complete: "complete 0.5s ease-out",
        fail: "fail 0.5s ease-out",
        "splash-wave": "splash-wave 3s ease-in-out infinite",
        "droplet-1": "droplet-base 2s ease-out infinite",
        "droplet-2": "droplet-base 2.2s ease-out infinite",
        "droplet-3": "droplet-base 1.8s ease-out infinite",
        "droplet-4": "droplet-base 2.4s ease-out infinite",
        "droplet-5": "droplet-base 1.9s ease-out infinite",
        "droplet-6": "droplet-base 2.1s ease-out infinite",
        ripple: "ripple 2s ease-out infinite",
        "perspective-shift": "perspective-shift 4s ease-in-out infinite",
        float: "float 20s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};
