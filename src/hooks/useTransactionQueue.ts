import { useState, useCallback } from "react";
import {
  Transaction,
  P2PKH,
  SatoshisPerKilobyte,
  PrivateKey,
  Script,
} from "@bsv/sdk";
import type {
  QueuedTransaction,
  TransactionRecipient,
  UseTransactionQueueProps,
  UseTransactionQueueReturn,
} from "../types/index";
import { logger } from "../utils/logger";
import { fetchTransactionHex } from "../services/api";
import { supabaseClient } from "../supabaseClient";

const MIN_FEE_RATE = 0.5; // 0.5 sats/kb minimum fee rate
const SQUIRT_PREFIX = "SQUIRTINGSATS:::v1";
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // 0.5 seconds between retries
const BROADCAST_VERIFY_WAIT = 1500; // 1.5 seconds for verification
const INTER_TX_DELAY = 500; // 0.5 seconds between transactions

// Helper to create OP_RETURN script with support for longer messages
const createSquirtOpReturn = (username?: string, isPromo: boolean = false) => {
  // Split long messages into chunks if needed (max 100kb per chunk)
  const MAX_CHUNK_SIZE = 99000; // Leave some room for prefix
  const message = username || "anon";
  const chunks = [];

  // Format: SQUIRTINGSATS:::v1:::MESSAGE_TYPE:::CONTENT
  // MESSAGE_TYPE is determined by isPromo flag
  const messageType = isPromo ? "promo" : "squirt";
  const fullMessage = `${SQUIRT_PREFIX}:::${messageType}:::${message}`;

  // Convert to UTF-8 bytes
  const messageBytes = new TextEncoder().encode(fullMessage);

  // Split into chunks if necessary
  for (let i = 0; i < messageBytes.length; i += MAX_CHUNK_SIZE) {
    const chunk = messageBytes.slice(i, i + MAX_CHUNK_SIZE);
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    chunks.push(hex);
  }

  // For now, we'll just use the first chunk to keep it simple
  // In future, we could implement multi-output OP_RETURN for longer messages
  return Script.fromASM(`OP_FALSE OP_RETURN ${chunks[0]}`);
};

// Helper to verify transaction broadcast
const verifyBroadcast = async (txid: string): Promise<boolean> => {
  try {
    // Try to fetch the transaction from WhatsOnChain
    const response = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}`
    );
    return response.ok;
  } catch (error) {
    logger.error("Failed to verify transaction:", error);
    return false;
  }
};

// Helper to wait between retries
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useTransactionQueue({
  privateKey,
  sourceAddress,
  fetchUtxos,
  onSquirtComplete,
}: UseTransactionQueueProps): UseTransactionQueueReturn {
  const [queuedTransactions, setQueuedTransactions] = useState<
    QueuedTransaction[]
  >([]);

  const addToQueue = useCallback(
    (
      recipients: TransactionRecipient[],
      username?: string,
      isPromo?: boolean
    ): QueuedTransaction => {
      const id = crypto.randomUUID();
      const newTransaction: QueuedTransaction = {
        id,
        recipients,
        status: "pending",
        progress: 0,
        username,
        isPromo,
      };

      setQueuedTransactions((prev) => [...prev, newTransaction]);
      return newTransaction;
    },
    []
  );

  const updateTransaction = useCallback(
    (id: string, updates: Partial<QueuedTransaction>) => {
      setQueuedTransactions((prev) =>
        prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx))
      );
    },
    []
  );

  const processTransaction = useCallback(
    async (transaction: QueuedTransaction): Promise<void> => {
      if (!transaction) {
        logger.error("No transaction provided to process");
        return;
      }

      let retryCount = 0;
      let success = false;

      while (retryCount < MAX_RETRIES && !success) {
        try {
          updateTransaction(transaction.id, {
            status: "processing",
            progress: 10,
            error: undefined,
          });

          // Fetch fresh UTXOs each attempt
          const utxos = await fetchUtxos(sourceAddress);
          if (utxos.length === 0) {
            throw new Error("No confirmed UTXOs available");
          }

          updateTransaction(transaction.id, { progress: 20 });

          // Create transaction
          const tx = new Transaction();
          const privKey = PrivateKey.fromWif(privateKey);

          // Sort UTXOs by value (largest first) to minimize inputs
          const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value);

          // Add outputs first to estimate size
          for (const recipient of transaction.recipients) {
            tx.addOutput({
              lockingScript: new P2PKH().lock(recipient.address),
              satoshis: recipient.amount,
            });
          }

          // Add OP_RETURN output
          tx.addOutput({
            lockingScript: createSquirtOpReturn(
              transaction.username,
              transaction.isPromo
            ),
            satoshis: 0,
          });

          updateTransaction(transaction.id, { progress: 40 });

          // Calculate minimum fee with slightly higher rate on retries
          const feeRate = MIN_FEE_RATE * (1 + retryCount * 0.5); // Increase fee rate with each retry
          const feeModel = new SatoshisPerKilobyte(feeRate);
          let currentFee = 0;
          let totalInput = 0;
          let inputsAdded = 0;

          // Add inputs one by one until we have enough to cover outputs + fee
          for (const utxo of sortedUtxos) {
            const hexString = await fetchTransactionHex(utxo.tx_hash);
            const sourceTransaction = Transaction.fromHex(hexString);
            tx.addInput({
              sourceTransaction,
              sourceOutputIndex: utxo.tx_pos,
              unlockingScriptTemplate: new P2PKH().unlock(privKey),
            });

            inputsAdded++;
            totalInput += utxo.value;

            // Recalculate fee with current tx size
            currentFee = await feeModel.computeFee(tx);

            // Calculate total needed (outputs + fee)
            const totalOutput = transaction.recipients.reduce(
              (sum: number, r: TransactionRecipient) => sum + r.amount,
              0
            );
            const totalNeeded = totalOutput + currentFee;

            // If we have enough to cover outputs and fee, we can stop adding inputs
            if (totalInput >= totalNeeded) {
              break;
            }
          }

          updateTransaction(transaction.id, { progress: 60 });

          // Verify we have enough funds
          const totalOutput = transaction.recipients.reduce(
            (sum: number, r: TransactionRecipient) => sum + r.amount,
            0
          );

          if (totalInput < totalOutput + currentFee) {
            throw new Error(
              `Insufficient funds: need ${
                totalOutput + currentFee
              } sats, have ${totalInput} sats`
            );
          }

          // Add change output if needed
          const changeAmount = totalInput - totalOutput - currentFee;
          if (changeAmount >= 1) {
            tx.addOutput({
              lockingScript: new P2PKH().lock(sourceAddress),
              satoshis: changeAmount,
            });
          }

          updateTransaction(transaction.id, { progress: 80 });

          // Sign and broadcast
          await tx.sign();
          const result = await tx.broadcast();

          if (!result) {
            throw new Error("Broadcast failed - no result returned");
          }

          const txid = result.txid || result.toString();

          // Wait briefly and verify the transaction was actually broadcast
          await wait(BROADCAST_VERIFY_WAIT);
          const isVerified = await verifyBroadcast(txid);

          if (!isVerified) {
            throw new Error("Transaction verification failed");
          }

          logger.info("Transaction broadcast success and verified:", {
            txid,
            fee: currentFee,
            inputs: inputsAdded,
            totalInput,
            totalOutput,
            change: changeAmount,
            retryCount,
          });

          // Only insert into Supabase if we've verified the transaction
          const { error: dbError } = await supabaseClient
            .from("squirts")
            .insert({
              sender_address: sourceAddress,
              username: transaction.username || "anon",
              amount: transaction.recipients[0]?.amount || 0,
              txid,
            });

          if (dbError) {
            logger.error("❌ Failed to record squirt in Supabase:", dbError);
          } else {
            logger.info("✅ Successfully recorded squirt in Supabase");
            onSquirtComplete?.({
              sender_address: sourceAddress,
              username: transaction.username || "anon",
              amount: transaction.recipients[0]?.amount || 0,
            });
          }

          updateTransaction(transaction.id, {
            status: "completed",
            progress: 100,
            txid,
          });

          success = true;
        } catch (error) {
          logger.error(`Transaction attempt ${retryCount + 1} failed:`, error);

          if (retryCount < MAX_RETRIES - 1) {
            // If we have retries left, wait before trying again
            await wait(RETRY_DELAY * (retryCount + 1));
            retryCount++;

            updateTransaction(transaction.id, {
              status: "processing",
              progress: 0,
              error: `Retry ${retryCount}/${MAX_RETRIES}: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            });
          } else {
            // If we're out of retries, mark as failed
            updateTransaction(transaction.id, {
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
          }
        }
      }
    },
    [fetchUtxos, privateKey, sourceAddress, updateTransaction, onSquirtComplete]
  );

  const processQueue = useCallback(async () => {
    const pendingTransactions = queuedTransactions.filter(
      (tx) => tx.status === "pending"
    );

    // Process transactions sequentially with delay between each
    for (const transaction of pendingTransactions) {
      try {
        await processTransaction(transaction);
        // Add a small delay between transactions to allow UTXOs to propagate
        await wait(INTER_TX_DELAY);
      } catch (error) {
        logger.error("Failed to process transaction:", error);
        // Continue with next transaction instead of breaking
        await wait(INTER_TX_DELAY * 2); // Wait longer after an error
      }
    }
  }, [queuedTransactions, processTransaction]);

  const clearCompleted = useCallback(() => {
    setQueuedTransactions((prev) =>
      prev.filter((tx) => !["completed", "failed"].includes(tx.status))
    );
  }, []);

  return {
    queuedTransactions,
    addToQueue,
    processQueue,
    processTransaction,
    clearCompleted,
  };
}
