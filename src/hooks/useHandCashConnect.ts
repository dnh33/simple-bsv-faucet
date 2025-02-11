import { useState, useCallback, useEffect, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { HandCashConnect } from "@handcash/handcash-connect";
import { handcashStore, setHandcashState } from "../stores/handcash";
import type { HandCashAccount } from "../types/handcash";
import { logger } from "../utils/logger";
import { toast } from "react-hot-toast";

const HANDCASH_APP_ID = import.meta.env.VITE_HANDCASH_APP_ID;
const HANDCASH_APP_SECRET = import.meta.env.VITE_HANDCASH_APP_SECRET;

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

// Store the redirect URL for use in the connect function
const redirectUrl = `${getBaseUrl()}/handcash-callback`;

// HandCash permissions required by the app
const REQUIRED_PERMISSIONS = [
  "PAYMENT", // For sending transactions
  "SIGN_DATA", // For data signing
  "USER_PUBLIC_PROFILE", // For profile info
  "GET_BALANCE", // For checking balance
].join(" ");

interface UseHandCashConnectReturn {
  account: HandCashAccount | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useHandCashConnect(): UseHandCashConnectReturn {
  const state = useStore(handcashStore);
  const account = state.account;
  const authToken = state.authToken;

  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedReconnect, setHasAttemptedReconnect] = useState(false);

  // Memoize the HandCash client to prevent unnecessary re-renders
  const handCashClient = useMemo(
    () =>
      new HandCashConnect({
        appId: HANDCASH_APP_ID,
        appSecret: HANDCASH_APP_SECRET,
      }),
    []
  );

  const updateBalance = useCallback(
    async (authToken: string) => {
      try {
        const account = await handCashClient.getAccountFromAuthToken(authToken);
        const balanceResponse = await account.wallet.getSpendableBalance();
        return balanceResponse.spendableSatoshiBalance;
      } catch (error) {
        logger.error("Failed to update balance:", error);
        return undefined;
      }
    },
    [handCashClient]
  );

  // Auto-reconnect if token exists
  useEffect(() => {
    const reconnect = async () => {
      if (hasAttemptedReconnect || account) return;

      const authToken = localStorage.getItem("handcash_auth_token");
      const storedAccount = localStorage.getItem("handcash_account");

      logger.info("Auto-reconnect check", {
        hasToken: !!authToken,
        hasStoredAccount: !!storedAccount,
        baseUrl: getBaseUrl(),
      });

      if (!authToken) {
        setHasAttemptedReconnect(true);
        return;
      }

      const toastId = toast.loading("Reconnecting to HandCash...");

      try {
        setIsConnecting(true);
        logger.info("Attempting auto-reconnect with stored token");

        const handcashAccount = await handCashClient.getAccountFromAuthToken(
          authToken
        );
        logger.info("Auto-reconnect: Retrieved HandCash account");

        const profile = await handcashAccount.profile.getCurrentProfile();
        logger.info("Auto-reconnect: Retrieved profile", {
          handle: profile.publicProfile.handle,
        });

        const balanceInSatoshis = await updateBalance(authToken);
        logger.info("Auto-reconnect: Retrieved balance", {
          balanceInSatoshis,
        });

        setHandcashState({
          account: {
            id: profile.publicProfile.handle,
            publicKey: profile.publicProfile.handle,
            paymail: `${profile.publicProfile.handle}@handcash.io`,
            displayName: profile.publicProfile.displayName,
            avatarUrl: profile.publicProfile.avatarUrl,
            balance: balanceInSatoshis,
          },
          authToken,
          lastError: null,
        });

        logger.info("Auto-reconnect: Updated HandCash account state");
        toast.success("Reconnected to HandCash", { id: toastId });
      } catch (err) {
        logger.error("Error auto-reconnecting HandCash:", err);
        localStorage.removeItem("handcash_auth_token");
        localStorage.removeItem("handcash_account");
        setHandcashState({
          account: null,
          authToken: null,
          lastError: null,
        });
        toast.error("Failed to reconnect to HandCash", { id: toastId });
      } finally {
        setIsConnecting(false);
        setHasAttemptedReconnect(true);
      }
    };

    reconnect();
  }, [
    account,
    hasAttemptedReconnect,
    updateBalance,
    authToken,
    handCashClient,
  ]);

  // Fetch balance periodically when connected
  useEffect(() => {
    if (!account?.id) return;

    const fetchBalance = async () => {
      try {
        const authToken = localStorage.getItem("handcash_auth_token");
        if (!authToken) {
          logger.warn("No auth token found for balance update");
          return;
        }

        logger.info("Fetching updated balance");
        const balanceInSatoshis = await updateBalance(authToken);

        if (account) {
          const currentAccount = account as HandCashAccount;
          setHandcashState({
            account: {
              id: currentAccount.id,
              publicKey: currentAccount.publicKey,
              paymail: currentAccount.paymail,
              displayName: currentAccount.displayName,
              avatarUrl: currentAccount.avatarUrl,
              balance: balanceInSatoshis,
            },
            authToken,
            lastError: null,
          });
        }
        logger.info("Updated account with new balance");
      } catch (err) {
        logger.error("Error fetching HandCash balance:", err);
        toast.error("Failed to update HandCash balance");
      }
    };

    // Fetch initial balance
    fetchBalance();

    // Set up periodic balance updates
    const interval = setInterval(fetchBalance, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [account, updateBalance, authToken, handCashClient]);

  const connect = useCallback(async () => {
    if (!HANDCASH_APP_ID || !HANDCASH_APP_SECRET) {
      setError("HandCash credentials not configured");
      toast.error("HandCash is not properly configured");
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      logger.info("🔄 Initiating HandCash connection", {
        redirectUrl,
        permissions: REQUIRED_PERMISSIONS,
      });

      // Get the redirection URL from the SDK with our callback URL and permissions
      const authRedirectUrl = handCashClient.getRedirectionUrl({
        appId: HANDCASH_APP_ID,
        redirectUrl,
        permissions: REQUIRED_PERMISSIONS,
      });

      logger.info("🔄 Redirecting to HandCash", { authRedirectUrl });
      window.location.href = authRedirectUrl;
    } catch (err) {
      setError("Failed to connect to HandCash");
      toast.error("Failed to connect to HandCash");
      logger.error("HandCash connection error:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [handCashClient]);

  const disconnect = useCallback(() => {
    setHandcashState({
      account: null,
      authToken: null,
      lastError: null,
      connectionStatus: "disconnected",
    });
    setHasAttemptedReconnect(false);
    toast.success("Disconnected from HandCash");
  }, []);

  return {
    account,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
