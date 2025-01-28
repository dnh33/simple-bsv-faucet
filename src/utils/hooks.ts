import { useCallback } from "react";
import { fetchUtxos, fetchTransactionHex } from "../services/api";
import { useState } from "react";
import { PrivateKey } from "@bsv/sdk";
import { FAUCET_PRIVATE_KEY } from "./constants";

interface UseUTXOsProps {
  faucetAddress: string;
  onBalanceUpdate: (balance: number) => void;
}

export function useUTXOs({ faucetAddress, onBalanceUpdate }: UseUTXOsProps) {
  const updateBalance = useCallback(async () => {
    try {
      const utxos = await fetchUtxos(faucetAddress);
      const balance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
      onBalanceUpdate(balance);
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  }, [faucetAddress, onBalanceUpdate]);

  return {
    fetchUtxos,
    fetchTransactionHex,
    updateBalance,
  };
}

export function useFaucetWallet() {
  const [balance, setBalance] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);

  const privateKey = PrivateKey.fromWif(FAUCET_PRIVATE_KEY);
  const faucetAddress = privateKey.toAddress().toString();

  const handleCopyAddress = useCallback(() => {
    navigator.clipboard.writeText(faucetAddress);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }, [faucetAddress]);

  return {
    privateKey,
    faucetAddress,
    balance,
    setBalance,
    copySuccess,
    handleCopyAddress,
  };
}

export function useBonusSystem() {
  const [currentBonus, setCurrentBonus] = useState(0);
  const [remainingBonusClaims, setRemainingBonusClaims] = useState(0);

  const checkBonus = useCallback(() => {
    // 10% chance of activating a bonus round
    if (Math.random() < 0.1 && remainingBonusClaims === 0) {
      const bonus = Math.floor(Math.random() * 5) + 2; // 2-6 satoshis
      const claims = Math.floor(Math.random() * 3) + 1; // 1-3 claims
      setCurrentBonus(bonus);
      setRemainingBonusClaims(claims);
      return true;
    }
    return false;
  }, [remainingBonusClaims]);

  const activateBonus = useCallback((bonus: number, claims: number) => {
    setCurrentBonus(bonus);
    setRemainingBonusClaims(claims);
  }, []);

  const decrementBonusClaims = useCallback(() => {
    setRemainingBonusClaims((prev) => {
      const newValue = prev - 1;
      if (newValue === 0) {
        setCurrentBonus(0);
      }
      return newValue;
    });
  }, []);

  return {
    currentBonus,
    remainingBonusClaims,
    checkBonus,
    activateBonus,
    decrementBonusClaims,
  };
}
