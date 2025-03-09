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

// Polyfill for crypto.getRandomValues which is needed by BSV SDK but might not be available in Lambda
if (typeof globalThis.crypto === "undefined") {
  // Create a global crypto object if it doesn't exist
  globalThis.crypto = {};
}

if (typeof globalThis.crypto.getRandomValues === "undefined") {
  // Implement getRandomValues using Node.js crypto module
  globalThis.crypto.getRandomValues = function (buffer) {
    if (!(buffer instanceof Uint8Array)) {
      throw new TypeError("Expected Uint8Array");
    }
    const bytes = crypto.randomBytes(buffer.length);
    buffer.set(new Uint8Array(bytes));
    return buffer;
  };
  console.log("Added polyfill for crypto.getRandomValues");
}

// Constants
const FAUCET_AMOUNT = parseInt(process.env.FAUCET_AMOUNT, 10);
const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY;
const FAUCET_IDENTIFIER = process.env.FAUCET_IDENTIFIER;
const MIN_TIME_BETWEEN_CLAIMS = parseInt(
  process.env.MIN_TIME_BETWEEN_CLAIMS,
  10
);
const WOC_API_URL = "https://api.whatsonchain.com/v1/bsv/main";
const BITAILS_API_URL = "https://api.bitails.io";

// In-memory cache for rate limiting (will reset on Lambda cold start)
const recentClaims = {};

// Rate limiting function with time-based constraints
function isRateLimited(address, ipAddress) {
  const now = Date.now();
  const addressKey = `addr_${address}`;
  const ipKey = `ip_${ipAddress}`;

  // Define an array for permanently rate-limited addresses
  const bannedAddresses = [""];

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

// Record a successful claim to implement rate limiting
function recordClaim(address, ipAddress) {
  const now = Date.now();
  recentClaims[`addr_${address}`] = now;

  if (ipAddress) {
    recentClaims[`ip_${ipAddress}`] = now;
  }
}

// Fetch UTXOs with multiple fallback options and improved error handling
async function fetchUTXOs(address) {
  console.log(`Attempting to fetch UTXOs for ${address}`);

  // Helper function for timeout control
  const fetchWithTimeout = async (url, options = {}, timeout = 7000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  // First attempt: Try to use WhatsOnChain API
  try {
    console.log("Fetching UTXOs from WhatsOnChain API");
    const response = await fetchWithTimeout(
      `${WOC_API_URL}/address/${address}/unspent`
    );

    if (!response.ok) {
      console.log(
        `WhatsOnChain API returned: ${response.status} ${response.statusText}`
      );
      throw new Error(`WhatsOnChain API error: ${response.statusText}`);
    }

    const wocUtxos = await response.json();
    console.log(
      "WhatsOnChain API response:",
      JSON.stringify(wocUtxos, null, 2)
    );

    if (!wocUtxos || !Array.isArray(wocUtxos) || wocUtxos.length === 0) {
      console.log("No UTXOs found in WhatsOnChain response");
      throw new Error("No UTXOs found in WhatsOnChain response");
    }

    // Transform WhatsOnChain UTXOs to our standard format
    const transformedUtxos = wocUtxos.map((utxo) => ({
      txid: utxo.tx_hash,
      vout: utxo.tx_pos,
      satoshis: utxo.value,
      scriptPubKey: utxo.scriptPubKey,
    }));

    console.log(
      `Successfully fetched ${transformedUtxos.length} UTXOs from WhatsOnChain API`
    );
    return { utxos: transformedUtxos, source: "whatsonchain" };
  } catch (wocError) {
    console.log(`WhatsOnChain API UTXO fetch failed: ${wocError.message}`);
    console.log("Error details:", wocError.stack || "No stack trace available");

    // Second attempt: Fallback to Bitails
    try {
      console.log(`Fetching UTXOs from Bitails for address: ${address}`);
      const response = await fetchWithTimeout(
        `${BITAILS_API_URL}/addresses/${address}/unspent`,
        {}, // options
        10000 // longer timeout for Bitails
      );

      if (!response.ok) {
        console.log(
          `Bitails API returned: ${response.status} ${response.statusText}`
        );
        throw new Error(`Bitails API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Bitails API response:", JSON.stringify(data, null, 2));

      if (!data || !data.utxos || data.utxos.length === 0) {
        console.log("No UTXOs found in Bitails response");
        throw new Error("No UTXOs found in Bitails response");
      }

      // Transform Bitails UTXOs to our standard format
      const transformedUtxos = data.utxos.map((utxo) => ({
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        satoshis: utxo.value,
        scriptPubKey: utxo.scriptPubKey,
      }));

      console.log(
        `Successfully fetched ${transformedUtxos.length} UTXOs from Bitails`
      );
      return { utxos: transformedUtxos, source: "bitails" };
    } catch (bitailsError) {
      console.log(`Bitails UTXO fetch failed: ${bitailsError.message}`);
      console.log(
        "Error details:",
        bitailsError.stack || "No stack trace available"
      );

      // Final fallback: Check for cached UTXOs
      try {
        console.log("All UTXO services failed. Checking for cached UTXOs...");

        // Try to load from a global cache if available
        const cachedUtxos = global.cachedFaucetUtxos || [];

        if (cachedUtxos.length > 0) {
          console.log(`Using ${cachedUtxos.length} cached UTXOs as fallback`);
          return { utxos: cachedUtxos, source: "cache" };
        }

        console.log("No cached UTXOs available");
        throw new Error("All UTXO sources failed and no cache available");
      } catch (cacheError) {
        console.log("Cache fallback failed:", cacheError.message);
        throw new Error("All UTXO sources failed including cache fallback");
      }
    }
  }
}

// Generate a deployment ID using Node's crypto module directly
function generateDeploymentId() {
  // Create a random 16-byte buffer (128 bits)
  const randomBytes = crypto.randomBytes(16);
  // Convert to hexadecimal string
  return randomBytes.toString("hex");
}

// Add a custom broadcast method to handle broadcasting without relying on window.crypto
async function broadcastTxSafely(tx) {
  try {
    // Try the normal broadcast first
    console.log("Attempting normal transaction broadcast...");
    const result = await tx.broadcast();
    return result;
  } catch (error) {
    console.error("Normal broadcast failed:", error);

    // If it fails with a crypto error, try our custom implementation
    if (
      error.message.includes("secure random") ||
      error.message.includes("crypto")
    ) {
      console.log("Using custom WhatsOnChain broadcaster implementation...");

      // Get the signed transaction hex
      const signedHex = tx.toHex();
      console.log(`Signed transaction hex length: ${signedHex.length}`);

      // Create a POST request to the WhatsOnChain API
      const wocBroadcastUrl = `${WOC_API_URL}/tx/raw`;
      console.log(
        `Sending transaction to WhatsOnChain API: ${wocBroadcastUrl}`
      );

      const response = await fetch(wocBroadcastUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          txhex: signedHex,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `WhatsOnChain API error (${response.status}): ${errorText}`
        );
      }

      // WhatsOnChain returns txid directly as text
      const txid = await response.text();
      console.log("WhatsOnChain broadcast successful, txid:", txid);

      // Return the txid in the format expected by the calling code
      // Strip any surrounding quotes from the txid
      return { txid: txid.replace(/^"(.*)"$/, "$1") };
    }

    // If it's not a crypto error, rethrow
    throw error;
  }
}

// Lambda handler using only BSV SDK
export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  // Get the client IP address
  const ipAddress = event.requestContext?.identity?.sourceIp || null;

  // Set up CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "https://www.push-the-button.app",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "CORS preflight response" }),
    };
  }

  try {
    // Parse the request body
    console.log("Raw event.body:", event.body);
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      console.error("Error parsing body:", e);
      body = {};
    }
    console.log("Parsed body:", body);

    const recipientAddress = body.address;
    console.log("Recipient address:", recipientAddress);

    if (!recipientAddress) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Please provide a BSV address" }),
      };
    }

    // Check rate limits
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

    // Initialize with BSV SDK only
    const privateKey = PrivateKey.fromWif(FAUCET_PRIVATE_KEY);
    const faucetAddress = privateKey.toAddress().toString();
    console.log(`Using faucet address: ${faucetAddress}`);

    // Fetch UTXOs using direct API calls with fallbacks
    console.log(`Fetching UTXOs for address: ${faucetAddress}`);
    const { utxos, source } = await fetchUTXOs(faucetAddress);
    console.log(`Found ${utxos.length} UTXOs from ${source}`);

    // If we successfully got UTXOs, store them in the global cache for future use
    if (utxos.length > 0) {
      global.cachedFaucetUtxos = [...utxos];
      console.log(`Cached ${utxos.length} UTXOs for future use`);
    }

    if (utxos.length === 0) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ error: "No confirmed UTXOs available" }),
      };
    }

    // Calculate total available satoshis
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    console.log(`Total available: ${totalAvailable} satoshis`);

    if (totalAvailable < FAUCET_AMOUNT) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          error: "Insufficient funds in faucet",
          available: totalAvailable,
          required: FAUCET_AMOUNT,
        }),
      };
    }

    // Check if we have at least enough for the minimum viable transaction
    const minimumRequired = FAUCET_AMOUNT + 1; // 1 satoshi as minimum fee buffer
    if (totalAvailable < minimumRequired) {
      console.log(
        `Insufficient funds for transaction: ${totalAvailable} < ${minimumRequired}`
      );
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          error: `Insufficient funds in faucet. Need at least ${minimumRequired} satoshis.`,
          available: totalAvailable,
          required: minimumRequired,
        }),
      };
    }

    // Create transaction using BSV SDK
    console.log("Creating transaction...");
    const tx = new Transaction();

    // Sort UTXOs by value (ascending)
    utxos.sort((a, b) => a.satoshis - b.satoshis);

    // Use only the necessary UTXOs, starting from smallest
    let inputSum = 0;
    let usedUtxos = [];

    for (const utxo of utxos) {
      usedUtxos.push(utxo);
      inputSum += utxo.satoshis;

      // If we have enough inputs to cover the send amount plus a reasonable fee, stop adding inputs
      if (inputSum >= FAUCET_AMOUNT + 1) {
        // 1 satoshi as a buffer for fees
        break;
      }
    }

    // Add inputs from selected UTXOs
    console.log(`Adding ${usedUtxos.length} inputs to transaction`);
    for (const utxo of usedUtxos) {
      try {
        // Fetch the source transaction
        console.log(`Fetching source transaction ${utxo.txid}`);
        const txResponse = await fetch(`${WOC_API_URL}/tx/${utxo.txid}/hex`);
        if (!txResponse.ok) {
          throw new Error(
            `Failed to fetch source transaction: ${txResponse.statusText}`
          );
        }

        const hexString = await txResponse.text();
        const sourceTransaction = Transaction.fromHex(hexString);
        console.log(`Successfully parsed source transaction ${utxo.txid}`);

        tx.addInput({
          sourceTransaction,
          sourceOutputIndex: utxo.vout,
          unlockingScriptTemplate: new P2PKH().unlock(privateKey),
        });
      } catch (err) {
        console.error("Error adding input:", err);
        throw new Error(
          `Failed to add input: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      }
    }

    // Add recipient output
    try {
      console.log(
        `Adding output: ${FAUCET_AMOUNT} satoshis to ${recipientAddress}`
      );
      tx.addOutput({
        lockingScript: new P2PKH().lock(recipientAddress),
        satoshis: FAUCET_AMOUNT,
      });

      // Add OP_RETURN output
      console.log(`Adding OP_RETURN data: ${FAUCET_IDENTIFIER}`);
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
    } catch (err) {
      console.error("Error adding outputs:", err);
      throw new Error(
        `Failed to add outputs: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }

    // Calculate fee and add change output
    console.log("Calculating transaction fee...");
    const feeModel = new SatoshisPerKilobyte(0.5);
    const fee = await feeModel.computeFee(tx);
    console.log(`Computed fee: ${fee} satoshis`);
    const changeAmount = inputSum - FAUCET_AMOUNT - fee;

    if (changeAmount < 0) {
      throw new Error(
        `Insufficient funds after fee calculation. Need ${Math.abs(
          changeAmount
        )} more satoshis.`
      );
    }

    if (changeAmount > 0) {
      console.log(
        `Adding change output: ${changeAmount} satoshis back to ${faucetAddress}`
      );
      tx.addOutput({
        lockingScript: new P2PKH().lock(faucetAddress),
        satoshis: changeAmount,
      });
    }

    // Sign transaction
    console.log("Signing transaction...");
    await tx.sign();
    console.log("Transaction signed successfully");

    // Broadcast transaction using just BSV SDK with fallback
    console.log("Broadcasting transaction...");
    const result = await broadcastTxSafely(tx);
    if (!result) {
      throw new Error("Failed to broadcast transaction");
    }

    // Ensure the txid is properly formatted (strip any quotes)
    const txid = result.txid
      ? result.txid.replace(/^"(.*)"$/, "$1")
      : result.toString();
    console.log(`Transaction broadcast success: ${txid}`);

    // Record this claim for rate limiting
    recordClaim(recipientAddress, ipAddress);

    // Return success response
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
