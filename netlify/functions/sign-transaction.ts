import { Transaction, PrivateKey } from "@bsv/sdk";

export const handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    if (!process.env.FAUCET_PRIVATE_KEY) {
      throw new Error("Private key not configured");
    }

    const privateKey = PrivateKey.fromWif(process.env.FAUCET_PRIVATE_KEY);
    const dt = event.body + privateKey;
    const tx = Transaction.fromHex(dt);

    // Sign transaction
    await tx.sign();

    // Return the signed transaction hex
    return {
      statusCode: 200,
      body: tx.toHex(),
      headers: {
        "Content-Type": "text/plain",
      },
    };
  } catch (error) {
    console.error("Transaction signing error:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Failed to sign transaction",
        message: error.message,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  }
};
