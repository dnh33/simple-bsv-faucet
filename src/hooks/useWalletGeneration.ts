import { useState, useEffect, useCallback } from "react";
import { PrivateKey } from "@bsv/sdk";
import { logger } from "../utils/logger";
import type { WalletData } from "../types/index";
import { secureStorage } from "../stores/handcash"; // Reuse HandCash secure storage

interface UseWalletGenerationReturn {
  wallet: WalletData | null;
  generateWallet: () => Promise<void>;
  importWallet: (wif: string) => boolean;
  exportWallet: () => void;
  hasExported: boolean;
  error: string | null;
}

export function useWalletGeneration(): UseWalletGenerationReturn {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [hasExported, setHasExported] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load wallet from secure storage on mount
  useEffect(() => {
    const loadStoredWallet = async () => {
      try {
        setError(null);
        const storedWallet = await secureStorage.get("bsv_wallet");
        if (storedWallet) {
          const walletData = JSON.parse(storedWallet);
          setWallet(walletData);
          // Check if this wallet was previously exported
          const wasExported = await secureStorage.get("bsv_wallet_exported");
          setHasExported(wasExported === "true");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setError(errorMessage);
        logger.error("Failed to load stored wallet:", error);
      }
    };

    loadStoredWallet();
  }, []);

  // Set up beforeunload warning if wallet exists but hasn't been exported
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (wallet && !hasExported) {
        const message =
          "You haven't exported your wallet yet. Are you sure you want to leave?";
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [wallet, hasExported]);

  const generateWallet = useCallback(async () => {
    try {
      setError(null);
      const privateKey = PrivateKey.fromRandom();
      const address = privateKey.toAddress().toString();
      const publicKey = privateKey.toPublicKey().toString();
      const wif = privateKey.toWif();

      const walletData: WalletData = {
        address,
        privateKey: privateKey.toString(),
        publicKey,
        wif,
      };

      setWallet(walletData);
      setHasExported(false);

      // Store in secure storage
      await secureStorage.set("bsv_wallet", JSON.stringify(walletData));
      await secureStorage.set("bsv_wallet_exported", "false");

      logger.info("✅ New wallet generated and stored securely");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(errorMessage);
      logger.error("Failed to generate wallet:", error);
      throw error;
    }
  }, []);

  const importWallet = useCallback((wif: string): boolean => {
    try {
      setError(null);
      const privateKey = PrivateKey.fromWif(wif);
      const address = privateKey.toAddress().toString();
      const publicKey = privateKey.toPublicKey().toString();

      const walletData: WalletData = {
        address,
        privateKey: privateKey.toString(),
        publicKey,
        wif,
      };

      setWallet(walletData);
      setHasExported(true); // Imported wallets are considered exported

      // Store in secure storage
      secureStorage.set("bsv_wallet", JSON.stringify(walletData));
      secureStorage.set("bsv_wallet_exported", "true");

      logger.info("✅ Wallet imported and stored securely");
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(errorMessage);
      logger.error("Failed to import wallet:", error);
      return false;
    }
  }, []);

  const exportWallet = useCallback(() => {
    if (!wallet) return;

    try {
      setError(null);
      const blob = new Blob([JSON.stringify(wallet, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "squirtingsats-wallet.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Mark as exported
      setHasExported(true);
      secureStorage.set("bsv_wallet_exported", "true");

      logger.info("✅ Wallet exported successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(errorMessage);
      logger.error("Failed to export wallet:", error);
    }
  }, [wallet]);

  return {
    wallet,
    generateWallet,
    importWallet,
    exportWallet,
    hasExported,
    error,
  };
}
