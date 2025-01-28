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

    const privateKey = PrivateKey.fromWif(process.env.FAUCET_PRIVATE_KEY);
    const unsignedTx = Transaction.fromHex(event.body);

    // Create new transaction with proper unlocking scripts
    const tx = new Transaction();

    // Copy inputs with real private key unlocking scripts
    unsignedTx.inputs.forEach((input) => {
      tx.addInput({
        sourceTransaction: input.sourceTransaction,
        sourceOutputIndex: input.sourceOutputIndex,
        unlockingScriptTemplate: new P2PKH().unlock(privateKey),
      });
    });

    // Copy outputs exactly as they are
    unsignedTx.outputs.forEach((output) => {
      tx.addOutput(output);
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
