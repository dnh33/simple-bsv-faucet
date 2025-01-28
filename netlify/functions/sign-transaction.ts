import { Transaction, PrivateKey, P2PKH } from "@bsv/sdk";

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

    console.log("Received transaction hex:", event.body);
    const privateKey = PrivateKey.fromWif(process.env.FAUCET_PRIVATE_KEY);

    // Parse the original transaction
    const tx = Transaction.fromHex(event.body);

    // Replace unlocking script templates with real ones
    tx.inputs.forEach((input) => {
      input.unlockingScriptTemplate = new P2PKH().unlock(privateKey);
    });

    // Sign the transaction
    await tx.sign();

    // Verify we can serialize before returning
    const signedHex = tx.toHex();
    console.log("Signed transaction hex:", signedHex);

    return {
      statusCode: 200,
      body: signedHex,
      headers: {
        "Content-Type": "text/plain",
      },
    };
  } catch (error) {
    console.error("Transaction signing error:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Failed to sign transaction",
        message: error.message,
        details: error.stack,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  }
};
