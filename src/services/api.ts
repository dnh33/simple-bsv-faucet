import { UTXO } from "../types";
import { WOC_API_URL, BITAILS_API_URL } from "../utils/constants";

export async function fetchUtxos(address: string): Promise<UTXO[]> {
  try {
    console.log("Fetching UTXOs for address:", address);
    const response = await fetch(`${WOC_API_URL}/address/${address}/unspent`);
    if (!response.ok) {
      throw new Error(`WhatsOnChain API error: ${response.statusText}`);
    }
    const utxos = await response.json();
    console.log("Raw UTXOs response:", utxos);

    // Validate and filter UTXOs
    const validUtxos = utxos.filter((utxo: UTXO) => {
      const isValid = utxo.tx_hash && utxo.tx_pos !== undefined && utxo.value;
      if (!isValid) {
        console.log("Invalid UTXO found:", utxo);
      }
      return isValid;
    });

    // Sort by confirmation count (most confirmed first)
    return validUtxos.sort((a: UTXO, b: UTXO) => b.height - a.height);
  } catch (error) {
    console.error("Error fetching UTXOs:", error);
    throw error;
  }
}

export async function fetchTransactionHex(txid: string): Promise<string> {
  try {
    // Try Bitails first
    const response = await fetch(`${BITAILS_API_URL}/download/tx/${txid}/hex`, {
      headers: {
        "Content-Type": "application/gzip",
      },
    });

    if (!response.ok) {
      throw new Error(`Bitails API error: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    // Convert buffer to string first
    const decoder = new TextDecoder();
    const hexString = decoder.decode(buffer);
    console.log("Fetched hex string:", hexString);
    return hexString;
  } catch (error) {
    console.error("Error fetching from Bitails:", error);
    // Fallback to WhatsOnChain if Bitails fails
    const response = await fetch(`${WOC_API_URL}/tx/${txid}/hex`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch source transaction: ${response.statusText}`
      );
    }
    const hexString = await response.text();
    console.log("Fetched hex string (fallback):", hexString);
    return hexString;
  }
}
