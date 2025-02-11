import { useCallback } from "react";
import { HandCashConnect } from "@handcash/handcash-connect";
import { useStore } from "@nanostores/react";
import { handcashStore, setHandcashState } from "../stores/handcash";
import { logger } from "../utils/logger";
import type { WalletData } from "../types/index";
import type {
  PaymentParameters,
  PaymentRequestItem,
  CurrencyCode,
} from "../types/handcash-sdk";

const HANDCASH_APP_ID = import.meta.env.VITE_HANDCASH_APP_ID;
const HANDCASH_APP_SECRET = import.meta.env.VITE_HANDCASH_APP_SECRET;

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
    recipients: { address: string; amount: number }[]
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
    async (recipients: { address: string; amount: number }[]) => {
      if (!handcashAccount || !authToken) {
        logger.error(
          "❌ Attempted to send transaction without HandCash account"
        );
        throw new Error("HandCash account not connected");
      }

      try {
        logger.info("🔄 Initializing HandCash transaction", {
          recipients: recipients.map((r) => ({
            address: r.address,
            amount: r.amount,
          })),
          totalAmount: recipients.reduce((sum, r) => sum + r.amount, 0),
        });

        const account = await handCashClient.getAccountFromAuthToken(authToken);
        logger.info("✅ Retrieved HandCash account for transaction");

        // Format payments according to SDK requirements
        const paymentParameters: PaymentParameters = {
          description: "Squirting sats 💦",
          appAction: "squirt",
          payments: recipients.map(
            (recipient): PaymentRequestItem => ({
              destination: recipient.address,
              sendAmount: recipient.amount,
              currencyCode: "SAT" as CurrencyCode,
            })
          ),
        };

        logger.info("🔄 Sending HandCash transaction", {
          parameters: paymentParameters,
        });

        const result = await account.wallet.pay(paymentParameters);

        // Update balance after successful transaction
        const balanceResponse = await account.wallet.getSpendableBalance();
        setHandcashState({
          account: {
            ...handcashAccount,
            balance: balanceResponse.spendableSatoshiBalance,
          },
        });

        logger.info("✅ HandCash transaction sent", {
          txid: result.transactionId,
          recipients: recipients.length,
          result,
          newBalance: balanceResponse.spendableSatoshiBalance,
        });

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
          recipients: recipients.map((r) => ({
            address: r.address,
            amount: r.amount,
          })),
        });

        // Update error state
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
