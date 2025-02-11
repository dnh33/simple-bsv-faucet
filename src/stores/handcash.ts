import { atom, computed } from "nanostores";
import type { HandCashAccount } from "../types/handcash";
import { logger } from "../utils/logger";

interface HandCashState {
  account: HandCashAccount | null;
  authToken: string | null;
  lastError: string | null;
  connectionStatus: "disconnected" | "connecting" | "connected";
}

// Encryption key name in session storage
const ENCRYPTION_KEY_NAME = "handcash_encryption_key";
const ACCOUNT_DATA_NAME = "handcash_encrypted_account";
const AUTH_TOKEN_NAME = "handcash_encrypted_token";

// Utility functions for secure storage
const secureStorage = {
  // Generate or retrieve encryption key
  async getKey(): Promise<CryptoKey> {
    // Try to get existing key from session storage
    const existingKey = sessionStorage.getItem(ENCRYPTION_KEY_NAME);
    if (existingKey) {
      const keyBuffer = new Uint8Array(JSON.parse(existingKey)).buffer;
      return window.crypto.subtle.importKey("raw", keyBuffer, "AES-GCM", true, [
        "encrypt",
        "decrypt",
      ]);
    }

    // Generate new key if none exists
    const key = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );

    // Store key in session storage
    const exportedKey = await window.crypto.subtle.exportKey("raw", key);
    const keyArray = Array.from(new Uint8Array(exportedKey));
    sessionStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(keyArray));

    return key;
  },

  // Encrypt data
  async encrypt(data: string): Promise<string> {
    const key = await this.getKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);

    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      encodedData
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(
      iv.length + new Uint8Array(encryptedData).length
    );
    combined.set(iv);
    combined.set(new Uint8Array(encryptedData), iv.length);

    return btoa(String.fromCharCode(...combined));
  },

  // Decrypt data
  async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.getKey();
      const combined = new Uint8Array(
        atob(encryptedData)
          .split("")
          .map((char) => char.charCodeAt(0))
      );

      // Extract IV and data
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv,
        },
        key,
        data
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      logger.error("Failed to decrypt data:", error);
      return "";
    }
  },

  // Store encrypted data
  async set(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(value);
    sessionStorage.setItem(key, encrypted);
  },

  // Retrieve and decrypt data
  async get(key: string): Promise<string | null> {
    const encrypted = sessionStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(encrypted);
  },

  // Clear all secure data
  clear(): void {
    sessionStorage.removeItem(ENCRYPTION_KEY_NAME);
    sessionStorage.removeItem(ACCOUNT_DATA_NAME);
    sessionStorage.removeItem(AUTH_TOKEN_NAME);
  },
};

// Initialize state from secure storage
const getInitialState = async (): Promise<HandCashState> => {
  try {
    logger.info("🔄 Initializing HandCash store");

    const storedAccount = await secureStorage.get(ACCOUNT_DATA_NAME);
    const authToken = await secureStorage.get(AUTH_TOKEN_NAME);

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
        secureStorage.clear();
      }
    }
  } catch (err) {
    logger.error("❌ Error initializing HandCash state from storage:", err);
    // Clear potentially corrupted data
    secureStorage.clear();
  }

  return {
    account: null,
    authToken: null,
    lastError: null,
    connectionStatus: "disconnected",
  };
};

// Create the store with initial state
export const handcashStore = atom<HandCashState>(await getInitialState());

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
export const setHandcashState = async (updates: Partial<HandCashState>) => {
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

    // Update secure storage if account or authToken changed
    if (updates.account !== undefined) {
      if (updates.account) {
        await secureStorage.set(
          ACCOUNT_DATA_NAME,
          JSON.stringify(updates.account)
        );
      } else {
        sessionStorage.removeItem(ACCOUNT_DATA_NAME);
      }
    }

    if (updates.authToken !== undefined) {
      if (updates.authToken) {
        await secureStorage.set(AUTH_TOKEN_NAME, updates.authToken);
      } else {
        sessionStorage.removeItem(AUTH_TOKEN_NAME);
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
    // Clear secure storage
    secureStorage.clear();
  }
};

// Helper to clear all HandCash data
export const clearHandcashState = () => {
  secureStorage.clear();
  setHandcashState({
    account: null,
    authToken: null,
    lastError: null,
    connectionStatus: "disconnected",
  });
};

// Export secure storage for use in other components
export { secureStorage };
