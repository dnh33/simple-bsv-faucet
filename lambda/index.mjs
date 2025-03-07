import {
  Transaction,
  P2PKH,
  Script,
  SatoshisPerKilobyte,
  OP,
  PrivateKey,
} from "@bsv/sdk";
import { Wallet } from "@bsv/wallet-toolbox";
import fetch from "node-fetch";

// Constants
const FAUCET_AMOUNT = parseInt(process.env.FAUCET_AMOUNT || "1", 10);
const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY || "";
const FAUCET_IDENTIFIER =
  process.env.FAUCET_IDENTIFIER || "BSV Faucet | Lambda";
const MIN_TIME_BETWEEN_CLAIMS = parseInt(
  process.env.MIN_TIME_BETWEEN_CLAIMS || "3000",
  10
); // Default: 3 seconds
const WOC_API_URL = "https://api.whatsonchain.com/v1/bsv/main";

// In-memory cache for rate limiting (will reset on Lambda cold start)
const recentClaims = {};

// Rate limiting function with time-based constraints
function isRateLimited(address, ipAddress) {
  const now = Date.now();
  const addressKey = `addr_${address}`;
  const ipKey = `ip_${ipAddress}`;

  // Define an array for permanently rate-limited addresses
  const bannedAddresses = [
    "12qBusyX1YqmVJ1MF4squWaLwNHLx9teVd",
    "12Ssv7GNp64hmzMbVxZeFPh8mysr9N4YDB",
  ];

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

// Lambda handler
export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event));

  // Get the client IP address
  const ipAddress = event.requestContext?.identity?.sourceIp || null;

  // Set up CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*", // Update to restrict to your domain in production
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
    const body = JSON.parse(event.body || "{}");
    const recipientAddress = body.address;

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

    // Initialize wallet and get private key
    const privateKey = PrivateKey.fromWif(FAUCET_PRIVATE_KEY);
    const faucetAddress = privateKey.toAddress().toString();
    console.log(`Using faucet address: ${faucetAddress}`);

    // Initialize wallet toolbox
    const wallet = new Wallet({ chain: "main" });

    // Fetch UTXOs using wallet-toolbox
    console.log(`Fetching UTXOs for address: ${faucetAddress}`);
    const utxos = await wallet.listUnspent(faucetAddress);
    console.log(`Found ${utxos.length} UTXOs`);

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
        body: JSON.stringify({ error: "Insufficient funds in faucet" }),
      };
    }

    // Create transaction
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
      if (inputSum >= FAUCET_AMOUNT + 500) {
        // 500 satoshis as a buffer for fees
        break;
      }
    }

    // Add inputs from selected UTXOs
    for (const utxo of usedUtxos) {
      try {
        // Fetch the source transaction
        const txResponse = await fetch(`${WOC_API_URL}/tx/${utxo.txid}/hex`);
        if (!txResponse.ok) {
          throw new Error(
            `Failed to fetch source transaction: ${txResponse.statusText}`
          );
        }

        const hexString = await txResponse.text();
        const sourceTransaction = Transaction.fromHex(hexString);

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
      tx.addOutput({
        lockingScript: new P2PKH().lock(recipientAddress),
        satoshis: FAUCET_AMOUNT,
      });

      // Add OP_RETURN output
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
    const feeModel = new SatoshisPerKilobyte(0.5);
    const fee = await feeModel.computeFee(tx);
    const changeAmount = inputSum - FAUCET_AMOUNT - fee;

    if (changeAmount < 0) {
      throw new Error(
        `Insufficient funds after fee calculation. Need ${Math.abs(
          changeAmount
        )} more satoshis.`
      );
    }

    if (changeAmount > 0) {
      tx.addOutput({
        lockingScript: new P2PKH().lock(faucetAddress),
        satoshis: changeAmount,
      });
    }

    // Sign transaction
    await tx.sign();

    // Broadcast transaction
    const result = await tx.broadcast();
    if (!result) {
      throw new Error("Failed to broadcast transaction");
    }

    const txid = result.txid || result.toString();
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
