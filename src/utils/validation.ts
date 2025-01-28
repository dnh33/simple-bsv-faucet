import { P2PKH } from "@bsv/sdk";

/**
 * Validates a BSV address
 * @param address The address to validate
 * @returns true if the address is valid, false otherwise
 */
export function isValidBsvAddress(address: string): boolean {
  try {
    new P2PKH().lock(address);
    return true;
  } catch {
    return false;
  }
}
