import { useState, useEffect, useRef } from "react";
import { fetchUtxos } from "../services/api";
import { UTXO } from "../types";
import { logger } from "../utils/logger";

const FAST_POLL_INTERVAL = 3000; // 3 seconds
const SLOW_POLL_INTERVAL = 30000; // 30 seconds
const UNCHANGED_THRESHOLD = 2; // Number of unchanged checks before slowing down

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

  // Track balance history and polling state
  const lastBalanceRef = useRef(0);
  const unchangedCountRef = useRef(0);
  const currentIntervalRef = useRef(FAST_POLL_INTERVAL);
  const intervalIdRef = useRef<NodeJS.Timeout>();

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

      // Check if balance has changed
      if (totalBalance === lastBalanceRef.current) {
        unchangedCountRef.current++;

        // Switch to slow polling after threshold
        if (
          unchangedCountRef.current >= UNCHANGED_THRESHOLD &&
          currentIntervalRef.current !== SLOW_POLL_INTERVAL
        ) {
          logger.info("Switching to slow polling due to unchanged balance");
          currentIntervalRef.current = SLOW_POLL_INTERVAL;
          // Update the interval
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current);
          }
          intervalIdRef.current = setInterval(
            refreshBalance,
            SLOW_POLL_INTERVAL
          );
        }
      } else {
        // Reset on balance change
        unchangedCountRef.current = 0;
        if (currentIntervalRef.current !== FAST_POLL_INTERVAL) {
          logger.info("Switching to fast polling due to balance change");
          currentIntervalRef.current = FAST_POLL_INTERVAL;
          // Update the interval
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current);
          }
          intervalIdRef.current = setInterval(
            refreshBalance,
            FAST_POLL_INTERVAL
          );
        }
      }

      lastBalanceRef.current = totalBalance;
      setBalance(totalBalance);
      setUtxos(fetchedUtxos);
      logger.info(
        "Balance updated:",
        totalBalance,
        `(Polling interval: ${currentIntervalRef.current}ms)`
      );
    } catch (err) {
      setError("Failed to fetch balance");
      logger.error("Balance fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Reset state when address changes
    lastBalanceRef.current = 0;
    unchangedCountRef.current = 0;
    currentIntervalRef.current = FAST_POLL_INTERVAL;

    // Clear any existing interval
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }

    // Initial fetch
    refreshBalance();

    // Start polling
    intervalIdRef.current = setInterval(refreshBalance, FAST_POLL_INTERVAL);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
    };
  }, [address]); // Only depend on address changes

  return {
    balance,
    utxos,
    isLoading,
    error,
    refreshBalance,
  };
}
