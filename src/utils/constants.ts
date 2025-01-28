// API URLs
export const WOC_API_URL = "https://api.whatsonchain.com/v1/bsv/main";
export const BITAILS_API_URL = "https://api.bitails.io";

// Environment variables
export const FAUCET_AMOUNT = Number(import.meta.env.VITE_FAUCET_AMOUNT) || 0;
export const FAUCET_PRIVATE_KEY = import.meta.env.VITE_FAUCET_PRIVATE_KEY || "";
export const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY || "";

// Time constants
export const FIFTEEN_MINUTES = 15 * 60 * 1000;
export const ONE_DAY = 24 * 60 * 60 * 1000;

// Bonus system
const [minBonus, maxBonus] = (import.meta.env.VITE_BONUS_RANGE || "0-5")
  .split("-")
  .map(Number);
export const MIN_BONUS = minBonus;
export const MAX_BONUS = maxBonus;
export const BONUS_CHANCE = 0.05; // 5% chance

// Transaction constants
export const FAUCET_IDENTIFIER =
  window.location.hostname === "localhost" ? "BSV Faucet Test" : "BSV Faucet";
