import { useState } from "react";
import { PrivateKey } from "@bsv/sdk";
import type { WalletData } from "../types";
import { logger } from "../utils/logger";

interface UseWalletGenerationReturn {
  wallet: WalletData | null;
  generateWallet: () => void;
  importWallet: (wif: string) => boolean;
  exportWallet: () => void;
  error: string | null;
}

export function useWalletGeneration(): UseWalletGenerationReturn {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateWallet = () => {
    try {
      const privateKey = PrivateKey.fromRandom();
      const publicKey = privateKey.toPublicKey();
      const address = privateKey.toAddress().toString();
      const wif = privateKey.toWif();

      const newWallet: WalletData = {
        address,
        privateKey: privateKey.toString(),
        publicKey: publicKey.toString(),
        wif,
      };

      setWallet(newWallet);
      setError(null);
      logger.info("New wallet generated:", address);
    } catch (err) {
      setError("Failed to generate wallet");
      logger.error("Wallet generation error:", err);
    }
  };

  const importWallet = (wif: string): boolean => {
    try {
      const privateKey = PrivateKey.fromWif(wif);
      const publicKey = privateKey.toPublicKey();
      const address = privateKey.toAddress().toString();

      const importedWallet: WalletData = {
        address,
        privateKey: privateKey.toString(),
        publicKey: publicKey.toString(),
        wif,
      };

      setWallet(importedWallet);
      setError(null);
      logger.info("Wallet imported:", address);
      return true;
    } catch (err) {
      setError("Invalid wallet import format");
      logger.error("Wallet import error:", err);
      return false;
    }
  };

  const exportWallet = () => {
    if (!wallet) {
      setError("No wallet to export");
      return;
    }

    const walletData = JSON.stringify(wallet, null, 2);
    const blob = new Blob([walletData], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `bsv-wallet-${wallet.address.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logger.info("Wallet exported:", wallet.address);
  };

  return {
    wallet,
    generateWallet,
    importWallet,
    exportWallet,
    error,
  };
}
