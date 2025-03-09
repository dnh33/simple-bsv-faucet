import { useCallback, useState } from "react";
import { UTXO } from "../types";
import { WOC_API_URL, BITAILS_API_URL } from "../utils/constants";
import { logger } from "../utils/logger";

interface UseUTXOsProps {
  faucetAddress: string;
  onBalanceUpdate: (balance: number) => void;
}

export function useUTXOs({ faucetAddress, onBalanceUpdate }: UseUTXOsProps) {
  // Add state to track the most recently used data source
  const [lastUsedSource, setLastUsedSource] = useState<string>("none");
  // Cache UTXOs in memory to have a fallback
  const [cachedUtxos, setCachedUtxos] = useState<UTXO[]>([]);

  const fetchUtxos = useCallback(async (): Promise<{
    utxos: UTXO[];
    source: string;
  }> => {
    // Define a helper function to handle fetch errors consistently
    const fetchWithTimeout = async (url: string, timeout = 5000) => {
      logger.log(`Fetching from ${url} with timeout ${timeout}ms`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        logger.warn(`Request to ${url} timed out after ${timeout}ms`);
        controller.abort();
      }, timeout);

      try {
        const startTime = Date.now();
        const response = await fetch(url, { signal: controller.signal });
        const duration = Date.now() - startTime;
        logger.log(
          `Request to ${url} completed in ${duration}ms with status ${response.status}`
        );
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        logger.error(`Fetch error for ${url}:`, error);
        throw error;
      }
    };

    // Try with WhatsOnChain first
    try {
      logger.log(
        "Fetching UTXOs from WhatsOnChain for address:",
        faucetAddress
      );
      const response = await fetchWithTimeout(
        `${WOC_API_URL}/address/${faucetAddress}/unspent`,
        8000
      );

      if (!response.ok) {
        logger.warn(
          `WhatsOnChain API returned ${response.status}: ${response.statusText}`
        );
        throw new Error(`WhatsOnChain API error: ${response.statusText}`);
      }

      const utxos = await response.json();
      logger.log("WhatsOnChain UTXOs response:", utxos);

      // Validate and filter UTXOs
      const validUtxos = utxos.filter((utxo: UTXO) => {
        const isValid = utxo.tx_hash && utxo.tx_pos !== undefined && utxo.value;
        if (!isValid) {
          logger.warn("Invalid UTXO found:", utxo);
        }
        return isValid;
      });

      if (validUtxos.length > 0) {
        // Sort by confirmation count (most confirmed first)
        const sortedUtxos = validUtxos.sort(
          (a: UTXO, b: UTXO) => b.height - a.height
        );
        logger.log(
          `Successfully fetched ${sortedUtxos.length} UTXOs from WhatsOnChain`
        );

        // Cache the UTXOs for future use
        setCachedUtxos(sortedUtxos);
        setLastUsedSource("WhatsOnChain");

        return { utxos: sortedUtxos, source: "WhatsOnChain" };
      }

      logger.warn("No UTXOs found in WhatsOnChain response");
      throw new Error("No UTXOs found in WhatsOnChain response");
    } catch (wocError) {
      // WhatsOnChain failed, try Bittails as fallback
      logger.warn(
        "WhatsOnChain UTXO fetch failed, trying Bittails fallback:",
        wocError
      );

      try {
        logger.log("Fetching UTXOs from Bittails for address:", faucetAddress);
        const response = await fetchWithTimeout(
          `${BITAILS_API_URL}/addresses/${faucetAddress}/unspent`,
          10000 // Longer timeout for Bitails
        );

        if (!response.ok) {
          logger.warn(
            `Bittails API returned ${response.status}: ${response.statusText}`
          );
          throw new Error(`Bittails API error: ${response.statusText}`);
        }

        const data = await response.json();
        logger.log("Bittails response:", data);

        if (!data || !data.utxos || data.utxos.length === 0) {
          logger.warn("No UTXOs found in Bittails response");
          throw new Error("No UTXOs found in Bittails response");
        }

        // Transform Bittails UTXOs to match our UTXO type
        const transformedUtxos = data.utxos.map((utxo: any) => ({
          tx_hash: utxo.tx_hash,
          tx_pos: utxo.tx_pos,
          value: utxo.value,
          height: utxo.height || 0,
          scriptPubKey: utxo.scriptPubKey,
        }));

        // Sort by confirmation count
        const sortedUtxos = transformedUtxos.sort(
          (a: UTXO, b: UTXO) => b.height - a.height
        );
        logger.log(
          `Successfully fetched ${sortedUtxos.length} UTXOs from Bittails`
        );

        // Cache the UTXOs for future use
        setCachedUtxos(sortedUtxos);
        setLastUsedSource("Bittails");

        return { utxos: sortedUtxos, source: "Bittails" };
      } catch (bitailsError) {
        // Try cached UTXOs if both live providers failed
        logger.error("All UTXO providers failed:", {
          wocError:
            wocError instanceof Error ? wocError.message : String(wocError),
          bitailsError:
            bitailsError instanceof Error
              ? bitailsError.message
              : String(bitailsError),
        });

        // If we have cached UTXOs, use them as a fallback
        if (cachedUtxos.length > 0) {
          logger.log(
            `Using ${cachedUtxos.length} cached UTXOs from previous ${lastUsedSource} fetch`
          );
          return { utxos: cachedUtxos, source: `cached-${lastUsedSource}` };
        }

        // Return empty array but don't throw, to prevent UI breaking
        logger.warn("No cached UTXOs available, returning empty array");
        return { utxos: [], source: "failed" };
      }
    }
  }, [faucetAddress, cachedUtxos, lastUsedSource]);

  const updateBalance = useCallback(async () => {
    try {
      const { utxos, source } = await fetchUtxos();

      if (utxos.length === 0 && source === "failed") {
        // If fetching failed but we don't want to disrupt the UI, just log it
        logger.error("Failed to update balance due to UTXO fetch failure");
        return;
      }

      const balance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
      logger.log(`Updated balance: ${balance} satoshis (source: ${source})`);
      onBalanceUpdate(balance);
    } catch (err) {
      logger.error("Error fetching balance:", err);
    }
  }, [fetchUtxos, onBalanceUpdate]);

  return {
    fetchUtxos,
    updateBalance,
    lastUsedSource,
  };
}
