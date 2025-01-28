import { useCallback } from "react";
import { UTXO } from "../types";
import { WOC_API_URL } from "../utils/constants";
import { logger } from "../utils/logger";

interface UseUTXOsProps {
  faucetAddress: string;
  onBalanceUpdate: (balance: number) => void;
}

export function useUTXOs({ faucetAddress, onBalanceUpdate }: UseUTXOsProps) {
  const fetchUtxos = useCallback(async (): Promise<UTXO[]> => {
    try {
      logger.log("Fetching UTXOs for address:", faucetAddress);
      const response = await fetch(
        `${WOC_API_URL}/address/${faucetAddress}/unspent`
      );
      if (!response.ok) {
        throw new Error(`WhatsOnChain API error: ${response.statusText}`);
      }
      const utxos = await response.json();
      logger.log("Raw UTXOs response:", utxos);

      // Validate and filter UTXOs
      const validUtxos = utxos.filter((utxo: UTXO) => {
        const isValid = utxo.tx_hash && utxo.tx_pos !== undefined && utxo.value;
        if (!isValid) {
          logger.log("Invalid UTXO found:", utxo);
        }
        return isValid;
      });

      // Sort by confirmation count (most confirmed first)
      return validUtxos.sort((a: UTXO, b: UTXO) => b.height - a.height);
    } catch (err) {
      logger.error("Error fetching UTXOs:", err);
      throw err;
    }
  }, [faucetAddress]);

  const updateBalance = useCallback(async () => {
    try {
      const utxos = await fetchUtxos();
      const balance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
      onBalanceUpdate(balance);
    } catch (err) {
      logger.error("Error fetching balance:", err);
    }
  }, [fetchUtxos, onBalanceUpdate]);

  return {
    fetchUtxos,
    updateBalance,
  };
}
