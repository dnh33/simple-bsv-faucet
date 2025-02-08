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

// Helper to create OP_RETURN script
const createSquirtOpReturn = (username?: string) => {
  const message = `${SQUIRT_PREFIX}:::${username || "anon"}:::squirt`;
  // Convert message to hex manually
  const hex = Array.from(new TextEncoder().encode(message))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return Script.fromASM(`OP_FALSE OP_RETURN ${hex}`);
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
      username?: string
    ): QueuedTransaction => {
      const id = crypto.randomUUID();
      const newTransaction: QueuedTransaction = {
        id,
        recipients,
        status: "pending",
        progress: 0,
        username,
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

      try {
        updateTransaction(transaction.id, {
          status: "processing",
          progress: 10,
        });

        // Fetch UTXOs
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
          lockingScript: createSquirtOpReturn(transaction.username),
          satoshis: 0,
        });

        updateTransaction(transaction.id, { progress: 40 });

        // Calculate minimum fee
        const feeModel = new SatoshisPerKilobyte(MIN_FEE_RATE);
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
          // Only add change if it's at least 1 sat
          tx.addOutput({
            lockingScript: new P2PKH().lock(sourceAddress),
            satoshis: changeAmount,
          });
        }

        updateTransaction(transaction.id, { progress: 80 });

        // Sign and broadcast
        await tx.sign();
        const result = await tx.broadcast();

        if (result) {
          logger.info("Transaction broadcast success:", {
            txid: result.txid || result.toString(),
            fee: currentFee,
            inputs: inputsAdded,
            totalInput,
            totalOutput,
            change: changeAmount,
          });

          // Insert record into Supabase
          logger.info("📝 Recording squirt in Supabase...", {
            sender_address: sourceAddress,
            username: transaction.username || "anon",
            amount: transaction.recipients[0]?.amount || 0,
            txid: result.txid || result.toString(),
          });

          const { error: dbError } = await supabaseClient
            .from("squirts")
            .insert({
              sender_address: sourceAddress,
              username: transaction.username || "anon",
              amount: transaction.recipients[0]?.amount || 0,
              txid: result.txid || result.toString(),
            });

          if (dbError) {
            logger.error("❌ Failed to record squirt in Supabase:", dbError);
          } else {
            logger.info("✅ Successfully recorded squirt in Supabase");
            // Notify parent component about the new squirt
            onSquirtComplete?.({
              sender_address: sourceAddress,
              username: transaction.username || "anon",
              amount: transaction.recipients[0]?.amount || 0,
            });
          }

          updateTransaction(transaction.id, {
            status: "completed",
            progress: 100,
            txid: result.txid || result.toString(),
          });
        }
      } catch (error) {
        logger.error("Transaction processing error:", error);
        updateTransaction(transaction.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    },
    [fetchUtxos, privateKey, sourceAddress, updateTransaction, onSquirtComplete]
  );

  const processQueue = useCallback(async () => {
    const pendingTransactions = queuedTransactions.filter(
      (tx) => tx.status === "pending"
    );

    for (const transaction of pendingTransactions) {
      try {
        await processTransaction(transaction);
      } catch (error) {
        // Stop processing queue on first error
        break;
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
