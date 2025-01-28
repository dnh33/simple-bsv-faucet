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
    const tx = Transaction.fromHex(event.body);

    console.log("Transaction inputs:", JSON.stringify(tx.inputs, null, 2));
    console.log("Transaction outputs:", JSON.stringify(tx.outputs, null, 2));

    // Add unlocking script templates to all inputs
    tx.inputs.forEach((input, index) => {
      console.log(`Adding unlocking script template to input ${index}`);
      const template = new P2PKH().unlock(privateKey);
      console.log("Template created:", template);
      input.unlockingScriptTemplate = template;
    });

    console.log("Transaction before signing:", tx.toHex());

    // Sign the transaction
    await tx.sign();

    console.log("Transaction after signing:", tx.toHex());

    return {
      statusCode: 200,
      body: tx.toHex(),
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
