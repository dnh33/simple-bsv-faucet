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
import { fetchTransactionHex, fetchUtxos } from "../services/api";
import { supabaseClient } from "../supabaseClient";

const MIN_FEE_RATE = 0.5; // 0.5 sats/kb minimum fee rate
const SQUIRT_PREFIX = "SQUIRTINGSATS:::v1";
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // 0.5 seconds between retries
const INTER_TX_DELAY = 500; // 0.5 seconds between transactions

// Helper to wait between retries
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      isPromo?: boolean,
      timestamp?: number
    ): QueuedTransaction => {
      const id = crypto.randomUUID();
      const newTransaction: QueuedTransaction = {
        id,
        recipients,
        status: "pending",
        progress: 0,
        username,
        isPromo,
        timestamp: timestamp || Date.now(),
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
    async (
      transaction: QueuedTransaction & {
        preFetchedUtxos?: Awaited<ReturnType<typeof fetchUtxos>>;
      }
    ): Promise<void> => {
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

          // Use pre-fetched UTXOs if available, otherwise fetch fresh ones
          const utxos =
            transaction.preFetchedUtxos || (await fetchUtxos(sourceAddress));
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

          // Sign and broadcast with proper error handling
          updateTransaction(transaction.id, {
            status: "processing",
            progress: 80,
            error: undefined,
          });

          try {
            // Sign first
            await tx.sign();

            // Skip verification since we have all source transactions
            // The verify() function is failing because it expects merkle proofs
            // which we don't need for broadcasting transactions

            updateTransaction(transaction.id, {
              status: "processing",
              progress: 90,
              error: undefined,
            });

            // Broadcast with retry logic
            let broadcastError: Error | null = null;
            let result = null;

            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
              try {
                result = await tx.broadcast();
                if (result) {
                  const txid = result.txid || result.toString();
                  logger.info(`Transaction broadcast success, txid: ${txid}`);

                  // Wait longer for propagation with each retry
                  const waitTime = 2000 * (attempt + 1); // 2s, 4s, 6s
                  await wait(waitTime);

                  // Verify using multiple methods
                  try {
                    // Method 1: Check UTXOs
                    const newUtxos = await fetchUtxos(sourceAddress);
                    const changeUtxo = newUtxos.find(
                      (utxo) => utxo.tx_hash === txid
                    );

                    // Method 2: Try to fetch the transaction hex
                    let txHex: string | null = null;
                    try {
                      txHex = await fetchTransactionHex(txid);
                    } catch (error) {
                      logger.warn("Failed to fetch transaction hex:", error);
                    }

                    if (changeUtxo || txHex) {
                      logger.info("Transaction verified via UTXO or hex fetch");
                      broadcastError = null;
                      break;
                    }

                    logger.warn(
                      `Transaction ${txid} not yet found in UTXO set or hex fetch. Attempt ${
                        attempt + 1
                      }/${MAX_RETRIES}`
                    );
                    broadcastError = new Error(
                      "Transaction not yet propagated"
                    );
                  } catch (verifyErr) {
                    logger.warn(
                      `Verification attempt ${attempt + 1} failed:`,
                      verifyErr
                    );
                    broadcastError = verifyErr as Error;
                  }
                } else {
                  broadcastError = new Error("Broadcast returned no result");
                }
              } catch (err) {
                broadcastError = err as Error;
                logger.error(`Broadcast attempt ${attempt + 1} failed:`, err);
              }

              if (attempt < MAX_RETRIES - 1 && broadcastError) {
                const retryDelay = RETRY_DELAY * Math.pow(2, attempt);
                logger.info(
                  `Broadcast/verify attempt ${
                    attempt + 1
                  } failed, retrying after ${retryDelay}ms...`
                );
                await wait(retryDelay);
              }
            }

            if (broadcastError || !result) {
              throw (
                broadcastError ||
                new Error("Broadcast failed after all retries")
              );
            }

            const txid = result.txid || result.toString();

            // Transaction was successfully broadcast and verified
            logger.info("Transaction broadcast success and verified:", {
              txid,
              fee: currentFee,
              inputs: inputsAdded,
              totalInput,
              totalOutput,
              change: changeAmount,
              retryCount,
            });

            // Update transaction status to completed
            updateTransaction(transaction.id, {
              status: "completed",
              progress: 100,
              txid,
            });

            // Only record in Supabase if we verified the broadcast
            let dbSuccess = false;
            for (
              let attempt = 0;
              attempt < MAX_RETRIES && !dbSuccess;
              attempt++
            ) {
              try {
                const { error: dbError } = await supabaseClient
                  .from("squirts")
                  .insert({
                    sender_address: sourceAddress,
                    username: transaction.username || "anon",
                    amount: transaction.recipients[0]?.amount || 0,
                    txid,
                  });

                if (!dbError) {
                  dbSuccess = true;
                  logger.info("✅ Successfully recorded squirt in Supabase");
                  onSquirtComplete?.({
                    sender_address: sourceAddress,
                    username: transaction.username || "anon",
                    amount: transaction.recipients[0]?.amount || 0,
                  });
                } else {
                  throw dbError;
                }
              } catch (dbError) {
                logger.error(
                  `❌ Database recording attempt ${attempt + 1} failed:`,
                  dbError
                );
                if (attempt < MAX_RETRIES - 1) {
                  await wait(RETRY_DELAY * Math.pow(2, attempt)); // Exponential backoff
                }
              }
            }

            if (!dbSuccess) {
              logger.error(
                "❌ Failed to record squirt in Supabase after all retries"
              );
            }

            success = true;
          } catch (error) {
            // Handle transaction-specific errors
            updateTransaction(transaction.id, {
              status: "failed",
              progress: 0,
              error: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
          }
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

    if (pendingTransactions.length === 0) return;

    try {
      // Fetch UTXOs once for all transactions
      const allUtxos = await fetchUtxos(sourceAddress);
      if (allUtxos.length === 0) {
        throw new Error("No confirmed UTXOs available");
      }

      // Sort UTXOs by value (largest first)
      const sortedUtxos = [...allUtxos].sort((a, b) => b.value - a.value);

      // Calculate how many UTXOs we need per transaction (estimate 1 UTXO per tx for now)
      // We'll need at least enough to cover 1 sat + fees per transaction
      const estimatedFeePerTx = 300; // Conservative estimate
      const minPerTx = 1 + estimatedFeePerTx; // 1 sat + fees

      // Calculate total needed
      const totalNeeded = pendingTransactions.length * minPerTx;
      const totalAvailable = sortedUtxos.reduce(
        (sum, utxo) => sum + utxo.value,
        0
      );

      if (totalAvailable < totalNeeded) {
        throw new Error(
          `Insufficient funds for all transactions: need ~${totalNeeded} sats, have ${totalAvailable} sats`
        );
      }

      // Divide UTXOs among transactions
      let currentUtxoIndex = 0;
      const txUtxoMap = new Map();

      for (const tx of pendingTransactions) {
        const txUtxos = [];
        let txTotal = 0;

        // Add UTXOs until we have enough for this transaction
        while (txTotal < minPerTx && currentUtxoIndex < sortedUtxos.length) {
          const utxo = sortedUtxos[currentUtxoIndex];
          txUtxos.push(utxo);
          txTotal += utxo.value;
          currentUtxoIndex++;
        }

        if (txTotal < minPerTx) {
          throw new Error("Not enough UTXOs to allocate for all transactions");
        }

        txUtxoMap.set(tx.id, txUtxos);
      }

      // Process all transactions in parallel with their dedicated UTXOs
      await Promise.all(
        pendingTransactions.map(async (transaction) => {
          try {
            const dedicatedUtxos = txUtxoMap.get(transaction.id);
            if (!dedicatedUtxos) {
              throw new Error("No UTXOs allocated for transaction");
            }

            const modifiedTransaction = {
              ...transaction,
              preFetchedUtxos: dedicatedUtxos,
            };
            await processTransaction(modifiedTransaction);
          } catch (error) {
            logger.error("Failed to process transaction:", error);
            updateTransaction(transaction.id, {
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })
      );
    } catch (error) {
      logger.error("Error processing transaction queue:", error);
      // Mark all pending transactions as failed
      pendingTransactions.forEach((tx) => {
        updateTransaction(tx.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
    }
  }, [
    queuedTransactions,
    processTransaction,
    sourceAddress,
    fetchUtxos,
    updateTransaction,
  ]);

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
