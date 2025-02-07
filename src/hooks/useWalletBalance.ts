import { useState, useEffect } from "react";
import { fetchUtxos } from "../services/api";
import { UTXO } from "../types";
import { logger } from "../utils/logger";

interface UseWalletBalanceReturn {
  balance: number;
  utxos: UTXO[];
  isLoading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
}

export function useWalletBalance(
  address: string | null
): UseWalletBalanceReturn {
  const [balance, setBalance] = useState(0);
  const [utxos, setUtxos] = useState<UTXO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = async () => {
    if (!address) {
      setBalance(0);
      setUtxos([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetchedUtxos = await fetchUtxos(address);
      const totalBalance = fetchedUtxos.reduce(
        (sum, utxo) => sum + utxo.value,
        0
      );

      setBalance(totalBalance);
      setUtxos(fetchedUtxos);
      logger.info("Balance updated:", totalBalance);
    } catch (err) {
      setError("Failed to fetch balance");
      logger.error("Balance fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshBalance();

    // Refresh balance every 3 seconds
    const interval = setInterval(refreshBalance, 3000);
    return () => clearInterval(interval);
  }, [address]);

  return {
    balance,
    utxos,
    isLoading,
    error,
    refreshBalance,
  };
}
