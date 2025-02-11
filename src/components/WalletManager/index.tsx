import { useEffect, useRef, useState } from "react";
import { PrivateKey } from "@bsv/sdk";
import { useWalletGeneration } from "../../hooks/useWalletGeneration";
import { useWalletBalance } from "../../hooks/useWalletBalance";
import { useTransactionQueue } from "../../hooks/useTransactionQueue";
import { TransactionQueue } from "../TransactionQueue";
import type { TransactionRecipient } from "../../types";
import { fetchUtxos } from "../../services/api";
import "./WalletManager.css";

const DEFAULT_SPLASH_AMOUNT = 1; // 1 sat per recipient

export function WalletManager() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    wallet,
    generateWallet,
    importWallet,
    exportWallet,
    error: walletError,
  } = useWalletGeneration();

  const {
    balance,
    isLoading: balanceLoading,
    error: balanceError,
  } = useWalletBalance(wallet?.address || null);

  const { queuedTransactions, addToQueue, processQueue, clearCompleted } =
    useTransactionQueue({
      privateKey: wallet?.wif || "",
      sourceAddress: wallet?.address || "",
      fetchUtxos,
    });

  const [recipientCount, setRecipientCount] = useState(1);
  const [currentRecipient, setCurrentRecipient] =
    useState<TransactionRecipient | null>(null);

  const [copySuccess, setCopySuccess] = useState(false);

  // Generate initial recipient on mount
  useEffect(() => {
    generateNewRecipient();
  }, []);

  // Process queue when wallet is available
  useEffect(() => {
    if (wallet && queuedTransactions.some((tx) => tx.status === "pending")) {
      processQueue();
    }
  }, [wallet, queuedTransactions, processQueue]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const walletData = JSON.parse(text);

      if (!walletData.wif) {
        return;
      }

      importWallet(walletData.wif);
    } catch {
      // Error handling is done in the hook
    }
  };

  const generateNewRecipient = () => {
    const recipientKey = PrivateKey.fromRandom();
    const recipientAddress = recipientKey.toAddress().toString();
    setCurrentRecipient({
      address: recipientAddress,
      amount: DEFAULT_SPLASH_AMOUNT,
    });
  };

  const generateRecipients = (count: number): TransactionRecipient[] => {
    const recipients: TransactionRecipient[] = currentRecipient
      ? [currentRecipient]
      : [];

    // Generate additional recipients if count > 1
    if (count > 1) {
      const additionalRecipients = Array(count - 1)
        .fill(null)
        .map(() => {
          const recipientKey = PrivateKey.fromRandom();
          const recipientAddress = recipientKey.toAddress().toString();
          return {
            address: recipientAddress,
            amount: DEFAULT_SPLASH_AMOUNT,
          };
        });
      recipients.push(...additionalRecipients);
    }

    return recipients;
  };

  const handleSplash = () => {
    if (!wallet || balance < DEFAULT_SPLASH_AMOUNT * recipientCount) {
      return;
    }
    const recipients = generateRecipients(recipientCount);
    addToQueue(recipients);
    generateNewRecipient(); // Generate new recipient for next splash
  };

  const handleCopyAddress = async () => {
    if (!currentRecipient) return;
    try {
      await navigator.clipboard.writeText(currentRecipient.address);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  return (
    <div className="wallet-manager">
      <div className="wallet-actions">
        <button onClick={generateWallet} className="action-button ripple">
          Generate New Wallet
        </button>
        <button onClick={handleImportClick} className="action-button ripple">
          Import Wallet
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileImport}
          accept=".txt"
          style={{ display: "none" }}
        />
      </div>

      {walletError && <div className="error-message">{walletError}</div>}
      {balanceError && <div className="error-message">{balanceError}</div>}

      {wallet && (
        <div className="wallet-info">
          <h3>Current Wallet</h3>
          <div className="wallet-details">
            <div className="detail-row">
              <span className="label">Address:</span>
              <code className="value">{wallet.address}</code>
            </div>
            <div className="detail-row">
              <span className="label">Balance:</span>
              <code className="value balance">
                {balanceLoading ? "Loading..." : `${balance} sats`}
              </code>
            </div>
          </div>
          <button onClick={exportWallet} className="action-button ripple">
            Export Wallet
          </button>
        </div>
      )}

      <div className="splash-controls">
        {currentRecipient && (
          <div className="current-recipient">
            <div className="recipient-header">
              <h3>Next Recipient</h3>
              <div className="recipient-actions">
                <button
                  onClick={generateNewRecipient}
                  className="icon-button ripple"
                  title="Generate New Address"
                >
                  🔄
                </button>
                <button
                  onClick={handleCopyAddress}
                  className={`icon-button ripple ${
                    copySuccess ? "success" : ""
                  }`}
                  title="Copy Address"
                >
                  {copySuccess ? "✓" : "📋"}
                </button>
              </div>
            </div>
            <div className="recipient-address-container">
              <code className="recipient-address">
                {currentRecipient.address}
              </code>
              <div className="splash-indicator"></div>
            </div>
          </div>
        )}

        <div className="splash-actions">
          <div className="recipient-count">
            <label htmlFor="recipient-count">Number of Recipients:</label>
            <input
              id="recipient-count"
              type="number"
              min="1"
              max="10"
              value={recipientCount}
              onChange={(e) =>
                setRecipientCount(
                  Math.max(1, Math.min(10, Number(e.target.value)))
                )
              }
              disabled={!wallet}
            />
          </div>

          <button
            onClick={handleSplash}
            disabled={
              !wallet || balance < DEFAULT_SPLASH_AMOUNT * recipientCount
            }
            className="splash-button ripple"
          >
            <span className="splash-text">
              Splash {recipientCount}{" "}
              {recipientCount === 1 ? "Recipient" : "Recipients"}
            </span>
            <span className="splash-amount">
              ({DEFAULT_SPLASH_AMOUNT * recipientCount}{" "}
              {recipientCount === 1 ? "sat" : "sats"} total)
            </span>
          </button>
        </div>
      </div>

      <TransactionQueue
        transactions={queuedTransactions}
        onClearCompleted={clearCompleted}
      />
    </div>
  );
}
