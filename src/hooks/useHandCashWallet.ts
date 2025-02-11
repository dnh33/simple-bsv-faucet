import { useCallback } from "react";
import { HandCashConnect } from "@handcash/handcash-connect";
import { useStore } from "@nanostores/react";
import { handcashStore, setHandcashState } from "../stores/handcash";
import { logger } from "../utils/logger";
import type { WalletData } from "../types/index";
import type { PaymentParameters, CurrencyCode } from "../types/handcash-sdk";
import { supabaseClient } from "../supabaseClient";

const HANDCASH_APP_ID = import.meta.env.VITE_HANDCASH_APP_ID;
const HANDCASH_APP_SECRET = import.meta.env.VITE_HANDCASH_APP_SECRET;
const SQUIRT_PREFIX = "SQUIRTINGSATS:::v1";
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // 0.5 seconds between retries

// Helper to wait between retries
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

logger.info("🔑 HandCash wallet credentials check", {
  hasAppId: !!HANDCASH_APP_ID,
  hasAppSecret: !!HANDCASH_APP_SECRET,
});

const handCashClient = new HandCashConnect({
  appId: HANDCASH_APP_ID,
  appSecret: HANDCASH_APP_SECRET,
});

interface UseHandCashWalletReturn {
  wallet: WalletData | null;
  sendTransaction: (
    recipients: { address: string; amount: number }[],
    username?: string,
    isPromo?: boolean
  ) => Promise<string>;
}

export function useHandCashWallet(): UseHandCashWalletReturn {
  const { account: handcashAccount, authToken } = useStore(handcashStore);

  logger.info("🔄 HandCash wallet hook state", {
    hasAccount: !!handcashAccount,
    hasAuthToken: !!authToken,
    accountDetails: handcashAccount
      ? {
          id: handcashAccount.id,
          paymail: handcashAccount.paymail,
          balance: handcashAccount.balance,
        }
      : null,
  });

  const wallet = handcashAccount
    ? {
        address: handcashAccount.paymail,
        publicKey: handcashAccount.publicKey,
        privateKey: "", // HandCash manages the private key
        wif: "", // HandCash manages the WIF
      }
    : null;

  const sendTransaction = useCallback(
    async (
      recipients: { address: string; amount: number }[],
      username?: string,
      isPromo?: boolean
    ) => {
      if (!handcashAccount || !authToken) {
        logger.error(
          "❌ Attempted to send transaction without HandCash account"
        );
        throw new Error("HandCash account not connected");
      }

      if (recipients.length !== 1) {
        throw new Error("HandCash transactions must be sent one at a time");
      }

      const recipient = recipients[0];

      try {
        logger.info("🔄 Initializing HandCash transaction", {
          recipient: {
            address: recipient.address,
            amount: recipient.amount,
          },
        });

        const account = await handCashClient.getAccountFromAuthToken(authToken);
        logger.info("✅ Retrieved HandCash account for transaction");

        // Create OP_RETURN message
        const messageType = isPromo ? "promo" : "squirt";
        const message = username || "anon";
        const opReturnMessage = `${SQUIRT_PREFIX}:::${messageType}:::${message}`;

        // Convert UTF-8 string to hex
        const encoder = new TextEncoder();
        const bytes = encoder.encode(opReturnMessage);
        const hex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const paymentParams: PaymentParameters = {
          description: "Squirting sats 💦",
          appAction: "squirt",
          payments: [
            {
              destination: recipient.address,
              sendAmount: recipient.amount,
              currencyCode: "SAT" as CurrencyCode,
            },
          ],
          attachment: {
            format: "hex",
            value: hex,
          },
        };

        logger.info("🔄 Sending HandCash transaction", {
          parameters: paymentParams,
          recipient: recipient.address,
        });

        const result = await account.wallet.pay(paymentParams);

        logger.info("✅ HandCash transaction sent", {
          txid: result.transactionId,
          recipient: recipient.address,
        });

        // Update balance
        const balanceResponse = await account.wallet.getSpendableBalance();
        setHandcashState({
          account: {
            ...handcashAccount,
            balance: balanceResponse.spendableSatoshiBalance,
          },
        });

        // Record in Supabase
        let dbSuccess = false;
        for (let attempt = 0; attempt < MAX_RETRIES && !dbSuccess; attempt++) {
          try {
            const { error: dbError } = await supabaseClient
              .from("squirts")
              .insert({
                sender_address: handcashAccount.paymail,
                username: username || "anon",
                amount: recipient.amount,
                txid: result.transactionId,
              });

            if (!dbError) {
              dbSuccess = true;
              logger.info("✅ Recorded HandCash squirt in Supabase", {
                txid: result.transactionId,
                recipient: recipient.address,
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
              await wait(RETRY_DELAY * Math.pow(2, attempt));
            }
          }
        }

        if (!dbSuccess) {
          logger.error("❌ Failed to record HandCash squirt in Supabase", {
            txid: result.transactionId,
            recipient: recipient.address,
          });
        }

        return result.transactionId;
      } catch (error) {
        logger.error("❌ HandCash transaction error:", error, {
          errorDetails:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                }
              : error,
          recipient: {
            address: recipient.address,
            amount: recipient.amount,
          },
        });

        setHandcashState({
          lastError:
            error instanceof Error ? error.message : "Transaction failed",
        });

        throw error;
      }
    },
    [handcashAccount, authToken]
  );

  return {
    wallet,
    sendTransaction,
  };
}
