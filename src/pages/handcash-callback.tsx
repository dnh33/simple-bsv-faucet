import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { HandCashConnect } from "@handcash/handcash-connect";
import { setHandcashState } from "../stores/handcash";
import type { HandCashAccount, HandCashProfile } from "../types/handcash";
import { logger } from "../utils/logger";
import { toast } from "react-hot-toast";

const HANDCASH_APP_ID = import.meta.env.VITE_HANDCASH_APP_ID;
const HANDCASH_APP_SECRET = import.meta.env.VITE_HANDCASH_APP_SECRET;

logger.info("🔑 HandCash callback credentials check", {
  hasAppId: !!HANDCASH_APP_ID,
  hasAppSecret: !!HANDCASH_APP_SECRET,
  appId: HANDCASH_APP_ID?.slice(0, 4) + "...", // Log partial ID for debugging
});

const handCashClient = new HandCashConnect({
  appId: HANDCASH_APP_ID,
  appSecret: HANDCASH_APP_SECRET,
});

export default function HandCashCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    logger.info("🔄 HandCash callback component mounted", {
      url: window.location.href,
      search: location.search,
    });

    const handleCallback = async () => {
      // Get auth token from URL parameters
      const urlParams = new URLSearchParams(location.search);
      const authToken = urlParams.get("authToken");
      const fullUrl = window.location.href;

      logger.info("📥 HandCash callback received", {
        hasToken: !!authToken,
        fullUrl,
        search: location.search,
      });

      // Validate auth token
      if (!authToken) {
        const errorMessage = "No auth token received from HandCash";
        setError(errorMessage);
        logger.error("❌ " + errorMessage);
        toast.error("Authentication failed");
        setHandcashState({
          account: null,
          authToken: null,
          lastError: errorMessage,
          connectionStatus: "disconnected",
        });
        navigate("/");
        return;
      }

      const toastId = toast.loading("Connecting to HandCash...");

      try {
        // Get account from SDK first
        logger.info("🔄 Fetching HandCash account with token", {
          tokenLength: authToken.length,
          tokenStart: authToken.substring(0, 4) + "...",
        });

        const account = await handCashClient.getAccountFromAuthToken(authToken);

        // Get profile
        logger.info("🔄 Fetching HandCash profile");
        const profile =
          (await account.profile.getCurrentProfile()) as unknown as HandCashProfile;

        // Get balance
        logger.info("🔄 Fetching HandCash balance");
        const balanceResponse = await account.wallet.getSpendableBalance();
        const balanceInSatoshis = balanceResponse.spendableSatoshiBalance;

        const handcashAccount: HandCashAccount = {
          id: profile.handle,
          publicKey: profile.publicProfile.publicKey,
          paymail: `${profile.handle}@handcash.io`,
          displayName: profile.publicProfile.displayName,
          avatarUrl: profile.publicProfile.avatarUrl,
          balance: balanceInSatoshis,
        };

        // Store data
        localStorage.setItem("handcash_auth_token", authToken);
        localStorage.setItem(
          "handcash_account",
          JSON.stringify(handcashAccount)
        );

        // Update store with complete state
        logger.info("✅ Finalizing HandCash connection", {
          handle: profile.handle,
          hasBalance: !!balanceInSatoshis,
        });

        setHandcashState({
          account: handcashAccount,
          authToken,
          lastError: null,
          connectionStatus: "connected",
        });

        toast.success("Successfully connected to HandCash", { id: toastId });
        navigate("/");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        logger.error("❌ Error processing HandCash callback:", err);

        // Clean up storage
        localStorage.removeItem("handcash_auth_token");
        localStorage.removeItem("handcash_account");

        setHandcashState({
          account: null,
          authToken: null,
          lastError: errorMessage,
          connectionStatus: "disconnected",
        });

        setError(errorMessage);
        toast.error(`Failed to connect to HandCash: ${errorMessage}`, {
          id: toastId,
        });
        navigate("/");
      } finally {
        setIsProcessing(false);
      }
    };

    handleCallback();

    return () => {
      logger.info("👋 HandCash callback component unmounting");
    };
  }, [navigate, location]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">
          {error ? "Connection Failed" : "Connecting to HandCash..."}
        </h1>
        {isProcessing && !error ? (
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#1CF567] border-t-transparent mx-auto" />
        ) : error ? (
          <div className="text-red-500 mb-4">{error}</div>
        ) : (
          <div className="text-green-500 mb-4">Successfully connected!</div>
        )}
      </div>
    </div>
  );
}
