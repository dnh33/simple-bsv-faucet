import { useState, useCallback, useEffect } from "react";
import { useStore } from "@nanostores/react";
import { HandCashConnect } from "@handcash/handcash-connect";
import {
  handcashStore,
  setHandcashState,
  secureStorage,
} from "../stores/handcash";
import type { HandCashAccount } from "../types/handcash";
import { logger } from "../utils/logger";
import { toast } from "react-hot-toast";
import { useLocation } from "react-router-dom";

const HANDCASH_APP_ID = import.meta.env.VITE_HANDCASH_APP_ID;
const HANDCASH_APP_SECRET = import.meta.env.VITE_HANDCASH_APP_SECRET;

// Initialize HandCash Connect once
const handCashConnect = new HandCashConnect({
  appId: HANDCASH_APP_ID,
  appSecret: HANDCASH_APP_SECRET,
});

// Get base URL for callbacks
const getBaseUrl = () => {
  const isDevelopment = window.location.hostname === "localhost";
  return isDevelopment
    ? "http://localhost:3000"
    : "https://squirtingsats.netlify.app";
};

logger.info("🔧 Environment configuration", {
  baseUrl: getBaseUrl(),
  isDevelopment: window.location.hostname === "localhost",
  hasAppId: !!HANDCASH_APP_ID,
  hasAppSecret: !!HANDCASH_APP_SECRET,
});

interface UseHandCashConnectReturn {
  account: HandCashAccount | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useHandCashConnect(): UseHandCashConnectReturn {
  const location = useLocation();
  const state = useStore(handcashStore);
  const account = state.account;

  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle auth token from URL
  useEffect(() => {
    const handleAuthToken = async () => {
      const urlParams = new URLSearchParams(location.search);
      const authToken = urlParams.get("authToken");

      logger.info("🔍 Checking auth token state", {
        hasAuthToken: !!authToken,
        hasAccount: !!account,
        connectionStatus: state.connectionStatus,
        currentUrl: window.location.href,
      });

      // Only proceed with connection if we have an auth token and no account
      if (authToken && !account) {
        setIsConnecting(true);
        logger.info(
          "🔄 HandCash auth token detected in URL, proceeding with connection"
        );

        try {
          // Clear URL without refresh
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
          logger.info("🧹 Cleared URL params", {
            newUrl: window.location.href,
          });

          // Get account from SDK
          const account = await handCashConnect.getAccountFromAuthToken(
            authToken
          );
          const profile = await account.profile.getCurrentProfile();
          const balanceResponse = await account.wallet.getSpendableBalance();

          // Extract public key from profile data
          const publicKey =
            (profile as any).publicProfile?.publicKey ||
            profile.publicProfile.handle;

          const handcashAccount = {
            id: profile.publicProfile.handle,
            publicKey,
            paymail: `${profile.publicProfile.handle}@handcash.io`,
            displayName: profile.publicProfile.displayName,
            avatarUrl: profile.publicProfile.avatarUrl,
            balance: balanceResponse.spendableSatoshiBalance,
          };

          // Store data securely
          await secureStorage.set(
            "handcash_account",
            JSON.stringify(handcashAccount)
          );
          await secureStorage.set("handcash_auth_token", authToken);

          // Update state
          await setHandcashState({
            account: handcashAccount,
            authToken,
            lastError: null,
            connectionStatus: "connected",
          });

          toast.success("Successfully connected to HandCash");
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          logger.error("❌ HandCash connection error:", err);
          toast.error(`Failed to connect to HandCash: ${errorMessage}`);

          // Clean up
          logger.info("🧹 Cleaning up after connection error");
          secureStorage.clear();
          await setHandcashState({
            account: null,
            authToken: null,
            lastError: errorMessage,
            connectionStatus: "disconnected",
          });
        } finally {
          setIsConnecting(false);
        }
      } else if (authToken) {
        logger.info("⏭️ Skipping auth token processing", {
          reason: account
            ? "Account already exists"
            : state.connectionStatus === "disconnected"
            ? "Recently disconnected"
            : isConnecting
            ? "Already connecting"
            : "Unknown reason",
        });
      }
    };

    handleAuthToken();
  }, [location.search, account, state.connectionStatus, isConnecting]);

  const connect = useCallback(async () => {
    if (!HANDCASH_APP_ID || !HANDCASH_APP_SECRET) {
      setError("HandCash credentials not configured");
      toast.error("HandCash is not properly configured");
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      // Manual URL construction as shown in docs
      const redirectionLoginUrl = `https://app.handcash.io/#/authorizeApp?appId=${HANDCASH_APP_ID}`;

      logger.info("🔄 Redirecting to HandCash", { redirectionLoginUrl });
      window.location.href = redirectionLoginUrl;
    } catch (err) {
      setError("Failed to connect to HandCash");
      toast.error("Failed to connect to HandCash");
      logger.error("HandCash connection error:", err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      logger.info("🔄 Starting HandCash disconnect process");

      // Clear URL without refresh
      const oldUrl = window.location.href;
      window.history.replaceState({}, document.title, window.location.pathname);
      logger.info("🧹 Cleared URL", {
        oldUrl,
        newUrl: window.location.href,
      });

      // Clear all storage locations
      logger.info("🗑️ Clearing storage");
      // Clear localStorage
      localStorage.removeItem("handcash_auth_token");
      localStorage.removeItem("handcash_account");
      // Clear sessionStorage
      sessionStorage.removeItem("handcash_encryption_key");
      sessionStorage.removeItem("handcash_encrypted_account");
      sessionStorage.removeItem("handcash_encrypted_token");
      // Clear secure storage
      secureStorage.clear();

      // Update state
      logger.info("📝 Updating HandCash state to disconnected");
      await setHandcashState({
        account: null,
        authToken: null,
        lastError: null,
        connectionStatus: "disconnected",
      });

      // Force a page reload to ensure clean state
      window.location.reload();

      toast.success("Disconnected from HandCash");
    } catch (error) {
      logger.error("❌ Error during disconnect:", error);
      toast.error("Failed to disconnect properly");
    }
  }, []);

  // Subscribe to store changes
  useEffect(() => {
    if (state.connectionStatus === "disconnected") {
      setIsConnecting(false);
      setError(null);
    }
  }, [state.connectionStatus]);

  return {
    account,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
