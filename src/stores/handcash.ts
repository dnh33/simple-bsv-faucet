import { atom, computed } from "nanostores";
import type { HandCashAccount } from "../types/handcash";
import { logger } from "../utils/logger";

interface HandCashState {
  account: HandCashAccount | null;
  authToken: string | null;
  lastError: string | null;
  connectionStatus: "disconnected" | "connecting" | "connected";
}

// Initialize state from localStorage if available
const getInitialState = (): HandCashState => {
  try {
    logger.info("🔄 Initializing HandCash store");
    const storedAccount = localStorage.getItem("handcash_account");
    const authToken = localStorage.getItem("handcash_auth_token");

    logger.info("📦 Checking stored HandCash data", {
      hasStoredAccount: !!storedAccount,
      hasAuthToken: !!authToken,
    });

    if (storedAccount && authToken) {
      try {
        const account = JSON.parse(storedAccount);
        return {
          account,
          authToken,
          lastError: null,
          connectionStatus: "connected",
        };
      } catch (parseError) {
        logger.error("❌ Error parsing stored HandCash account:", parseError);
        // Clear corrupted data
        localStorage.removeItem("handcash_account");
        localStorage.removeItem("handcash_auth_token");
      }
    }
  } catch (err) {
    logger.error("❌ Error initializing HandCash state from storage:", err);
    // Clear potentially corrupted data
    localStorage.removeItem("handcash_account");
    localStorage.removeItem("handcash_auth_token");
  }

  return {
    account: null,
    authToken: null,
    lastError: null,
    connectionStatus: "disconnected",
  };
};

// Create the store with initial state
export const handcashStore = atom<HandCashState>(getInitialState());

// Computed values for easy access
export const handcashAccount = computed(
  handcashStore,
  (state) => state.account
);
export const handcashAuthToken = computed(
  handcashStore,
  (state) => state.authToken
);
export const handcashError = computed(
  handcashStore,
  (state) => state.lastError
);

// Action to update the entire state
export const setHandcashState = (updates: Partial<HandCashState>) => {
  try {
    const currentState = handcashStore.get();
    const newState = { ...currentState, ...updates };

    // Ensure connectionStatus is updated based on account/authToken
    if (updates.account !== undefined || updates.authToken !== undefined) {
      newState.connectionStatus =
        newState.account && newState.authToken ? "connected" : "disconnected";
    }

    logger.info("🔄 Updating HandCash state", {
      previousState: {
        hasAccount: !!currentState.account,
        hasAuthToken: !!currentState.authToken,
        lastError: currentState.lastError,
        connectionStatus: currentState.connectionStatus,
      },
      newState: {
        hasAccount: !!newState.account,
        hasAuthToken: !!newState.authToken,
        lastError: newState.lastError,
        connectionStatus: newState.connectionStatus,
      },
    });

    // Update localStorage if account or authToken changed
    if (updates.account !== undefined) {
      if (updates.account) {
        localStorage.setItem(
          "handcash_account",
          JSON.stringify(updates.account)
        );
      } else {
        localStorage.removeItem("handcash_account");
      }
    }

    if (updates.authToken !== undefined) {
      if (updates.authToken) {
        localStorage.setItem("handcash_auth_token", updates.authToken);
      } else {
        localStorage.removeItem("handcash_auth_token");
      }
    }

    // Update the store
    handcashStore.set(newState);

    // Verify the update
    const verifiedState = handcashStore.get();
    logger.info("✅ Verified HandCash store state", {
      hasAccount: !!verifiedState.account,
      hasAuthToken: !!verifiedState.authToken,
      lastError: verifiedState.lastError,
    });
  } catch (err) {
    logger.error("❌ Error updating HandCash state:", err);
    // Set error state
    handcashStore.set({
      account: null,
      authToken: null,
      lastError: err instanceof Error ? err.message : "Unknown error",
      connectionStatus: "disconnected",
    });
    // Clear localStorage
    localStorage.removeItem("handcash_account");
    localStorage.removeItem("handcash_auth_token");
  }
};

// Helper to clear all HandCash data
export const clearHandcashState = () => {
  setHandcashState({
    account: null,
    authToken: null,
    lastError: null,
    connectionStatus: "disconnected",
  });
};
