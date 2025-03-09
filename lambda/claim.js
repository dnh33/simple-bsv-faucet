import {
  Transaction,
  P2PKH,
  Script,
  SatoshisPerKilobyte,
  OP,
  PrivateKey,
} from "@bsv/sdk";
import fetch from "node-fetch";
import crypto from "crypto";

// Constants
const FAUCET_AMOUNT = parseInt(process.env.FAUCET_AMOUNT, 10);
const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY;
const FAUCET_IDENTIFIER = process.env.FAUCET_IDENTIFIER;
const MIN_TIME_BETWEEN_CLAIMS = parseInt(
  process.env.MIN_TIME_BETWEEN_CLAIMS,
  10
);
const WOC_API_URL = "https://api.whatsonchain.com/v1/bsv/main";

// In-memory cache for rate limiting
const recentClaims = {};

// Rate limiting function
function isRateLimited(address, ipAddress) {
  const now = Date.now();
  const addressKey = `addr_${address}`;
  const ipKey = `ip_${ipAddress}`;

  // Define an array for permanently rate-limited addresses
  const bannedAddresses = [];

  // Check if address is banned
  if (bannedAddresses.includes(address)) {
    return {
      limited: true,
      reason: "This address is permanently rate-limited.",
    };
  }

  // Check if address has claimed recently
  if (
    recentClaims[addressKey] &&
    now - recentClaims[addressKey] < MIN_TIME_BETWEEN_CLAIMS
  ) {
    const waitTimeSeconds = Math.ceil(
      (MIN_TIME_BETWEEN_CLAIMS - (now - recentClaims[addressKey])) / 1000
    );
    return {
      limited: true,
      reason: `Please wait ${waitTimeSeconds} second(s) before claiming again.`,
      remainingTime: waitTimeSeconds,
    };
  }

  // Check if IP has claimed recently (if IP is provided)
  if (
    ipAddress &&
    recentClaims[ipKey] &&
    now - recentClaims[ipKey] < MIN_TIME_BETWEEN_CLAIMS
  ) {
    const waitTimeSeconds = Math.ceil(
      (MIN_TIME_BETWEEN_CLAIMS - (now - recentClaims[ipKey])) / 1000
    );
    return {
      limited: true,
      reason: `Please wait ${waitTimeSeconds} second(s) before claiming again.`,
      remainingTime: waitTimeSeconds,
    };
  }

  return { limited: false };
}

// Record a claim
function recordClaim(address, ipAddress) {
  const now = Date.now();
  recentClaims[`addr_${address}`] = now;

  if (ipAddress) {
    recentClaims[`ip_${ipAddress}`] = now;
  }
}

// Lambda handler
export const handler = async (event) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "https://www.push-the-button.app",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle OPTIONS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "CORS preflight response" }),
    };
  }

  try {
    // Parse request
    const body = JSON.parse(event.body || "{}");
    const recipientAddress = body.address;
    const ipAddress = event.requestContext?.identity?.sourceIp || null;

    // Validation
    if (!recipientAddress) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Please provide a BSV address" }),
      };
    }

    // Rate limiting
    const rateLimitCheck = isRateLimited(recipientAddress, ipAddress);
    if (rateLimitCheck.limited) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          error: rateLimitCheck.reason,
          remainingTime: rateLimitCheck.remainingTime || 0,
        }),
      };
    }

    // Get private key and address
    const privateKey = PrivateKey.fromWif(FAUCET_PRIVATE_KEY);
    const faucetAddress = privateKey.toAddress().toString();

    // Fetch UTXOs directly from WhatsOnChain API
    const utxoResponse = await fetch(
      `${WOC_API_URL}/address/${faucetAddress}/unspent`
    );

    if (!utxoResponse.ok) {
      throw new Error(`Failed to fetch UTXOs: ${utxoResponse.statusText}`);
    }

    const utxos = await utxoResponse.json();

    if (!utxos || utxos.length === 0) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ error: "No confirmed UTXOs available" }),
      };
    }

    // Calculate total available
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

    if (totalAvailable < FAUCET_AMOUNT + 500) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ error: "Insufficient funds in faucet" }),
      };
    }

    // Create transaction
    const tx = new Transaction();

    // Select inputs
    utxos.sort((a, b) => a.value - b.value);
    let inputSum = 0;
    let usedUtxos = [];

    for (const utxo of utxos) {
      if (inputSum >= FAUCET_AMOUNT + 500) break;

      usedUtxos.push(utxo);
      inputSum += utxo.value;
    }

    // Add inputs
    for (const utxo of usedUtxos) {
      const txResponse = await fetch(`${WOC_API_URL}/tx/${utxo.tx_hash}/hex`);
      const hexString = await txResponse.text();
      const sourceTransaction = Transaction.fromHex(hexString);

      tx.addInput({
        sourceTransaction,
        sourceOutputIndex: utxo.tx_pos,
        unlockingScriptTemplate: new P2PKH().unlock(privateKey),
      });
    }

    // Add outputs
    tx.addOutput({
      lockingScript: new P2PKH().lock(recipientAddress),
      satoshis: FAUCET_AMOUNT,
    });

    tx.addOutput({
      lockingScript: new Script([
        { op: OP.OP_FALSE },
        { op: OP.OP_RETURN },
        {
          op: OP.OP_PUSHDATA1,
          data: Array.from(new TextEncoder().encode(FAUCET_IDENTIFIER)),
        },
      ]),
      satoshis: 0,
    });

    // Calculate fee and add change
    const feeModel = new SatoshisPerKilobyte(0.5);
    const fee = await feeModel.computeFee(tx);
    const changeAmount = inputSum - FAUCET_AMOUNT - fee;

    if (changeAmount > 0) {
      tx.addOutput({
        lockingScript: new P2PKH().lock(faucetAddress),
        satoshis: changeAmount,
      });
    }

    // Sign transaction
    await tx.sign();

    // Simple polyfill for crypto (only if broadcast fails with crypto error)
    if (
      typeof globalThis.crypto === "undefined" ||
      typeof globalThis.crypto.getRandomValues === "undefined"
    ) {
      globalThis.crypto = globalThis.crypto || {};
      globalThis.crypto.getRandomValues = function (buffer) {
        const bytes = crypto.randomBytes(buffer.length);
        buffer.set(new Uint8Array(bytes));
        return buffer;
      };
    }

    // Broadcast transaction
    const result = await tx.broadcast();

    if (!result) {
      throw new Error("Failed to broadcast transaction");
    }

    const txid = result.txid || result.toString();

    // Record claim
    recordClaim(recipientAddress, ipAddress);

    // Return success
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        txid,
        amount: FAUCET_AMOUNT,
        message: "BSV sent successfully",
        nextClaimTime: Date.now() + MIN_TIME_BETWEEN_CLAIMS,
      }),
    };
  } catch (error) {
    console.error("Error processing claim:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: `Error processing claim: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      }),
    };
  }
};
