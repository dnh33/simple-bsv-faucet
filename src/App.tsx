import { useEffect, useState } from "react";
import {
  Transaction,
  P2PKH,
  Script,
  SatoshisPerKilobyte,
  OP,
  PrivateKey,
} from "@bsv/sdk";
import "./styles/components";
import "./App.css";

import { useUTXOs, useFaucetWallet, useBonusSystem } from "./utils/hooks";
import { FAUCET_AMOUNT, FAUCET_IDENTIFIER } from "./utils/constants";

import { FaucetInfo } from "./components/FaucetInfo";
import { AddressInput } from "./components/AddressInput";
import { ClaimButton } from "./components/ClaimButton";
import { StatusMessage } from "./components/StatusMessage";
import { SuccessNotification } from "./components/SuccessNotification";

function App() {
  // State
  const [recipientAddress, setRecipientAddress] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [successTxid, setSuccessTxid] = useState<string | null>(null);

  // Initialize wallet
  const {
    privateKey,
    faucetAddress,
    balance: walletBalance,
    setBalance: setWalletBalance,
    copySuccess: walletCopySuccess,
    handleCopyAddress: handleWalletCopyAddress,
  } = useFaucetWallet();

  // Initialize hooks
  const { fetchUtxos, fetchTransactionHex, updateBalance } = useUTXOs({
    faucetAddress,
    onBalanceUpdate: setWalletBalance,
  });
  const {
    currentBonus: bonusSystemCurrentBonus,
    remainingBonusClaims: bonusSystemRemainingBonusClaims,
    decrementBonusClaims,
  } = useBonusSystem();

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(faucetAddress);
    handleWalletCopyAddress();
  };

  // Update balance periodically
  useEffect(() => {
    updateBalance();
    const interval = setInterval(updateBalance, 30000);
    return () => clearInterval(interval);
  }, [updateBalance]);

  const handleClaim = async () => {
    try {
      setLoading(true);
      setStatus("");
      setSuccessTxid(null);

      // Validate inputs
      if (!recipientAddress) {
        throw new Error("Please enter a BSV address");
      }

      // Fetch UTXOs
      const utxos = await fetchUtxos(faucetAddress);
      if (utxos.length === 0) {
        throw new Error("No confirmed UTXOs available");
      }

      // Create transaction
      let tx = new Transaction();

      // Add inputs from confirmed UTXOs
      for (const utxo of utxos) {
        try {
          const hexString = await fetchTransactionHex(utxo.tx_hash);
          console.log("Using hex string for input:", hexString);
          const sourceTransaction = Transaction.fromHex(hexString);

          // Always add unlocking script template for fee computation
          const unlockingTemplate = new P2PKH().unlock(
            import.meta.env.PROD
              ? PrivateKey.fromRandom() // Placeholder for fee calculation
              : privateKey
          );

          tx.addInput({
            sourceTransaction,
            sourceOutputIndex: utxo.tx_pos,
            unlockingScriptTemplate: unlockingTemplate,
          });
        } catch (err) {
          console.error("Error adding input:", err);
          throw new Error(
            `Failed to add input: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
      }

      // Calculate total input
      const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

      // Add recipient output
      const recipientAmount =
        FAUCET_AMOUNT +
        (bonusSystemRemainingBonusClaims > 0 ? bonusSystemCurrentBonus : 0);
      try {
        tx.addOutput({
          lockingScript: new P2PKH().lock(recipientAddress),
          satoshis: recipientAmount,
        });

        // Add OP_RETURN output
        tx.addOutput({
          lockingScript: new Script([
            { op: OP.OP_FALSE },
            { op: OP.OP_RETURN },
            {
              op: OP.OP_PUSHDATA1,
              data: Array.from(new TextEncoder().encode(FAUCET_IDENTIFIER)),
            },
          ]),
          satoshis: 0,
        });
      } catch (err) {
        console.error("Error adding outputs:", err);
        throw new Error(
          `Failed to add outputs: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      }

      // Calculate fee and add change output
      const feeModel = new SatoshisPerKilobyte(0.5);
      const fee = await feeModel.computeFee(tx);
      const changeAmount = totalInput - recipientAmount - fee;

      if (changeAmount < 0) {
        throw new Error("Insufficient funds");
      }

      if (changeAmount > 0) {
        tx.addOutput({
          lockingScript: new P2PKH().lock(faucetAddress),
          satoshis: changeAmount,
        });
      }

      // Sign transaction based on environment
      if (import.meta.env.PROD) {
        // In production, use Netlify function
        const response = await fetch("/.netlify/functions/sign-transaction", {
          method: "POST",
          body: tx.toHex(),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to sign transaction");
        }

        const signedTxHex = await response.text();
        tx = Transaction.fromHex(signedTxHex);
      } else {
        // In development, sign locally
        await tx.sign();
      }

      // Broadcast transaction
      const result = await tx.broadcast();
      if (!result) {
        throw new Error("Failed to broadcast transaction");
      }

      // Update UI
      setSuccessTxid(result.txid || result.toString());
      if (bonusSystemRemainingBonusClaims > 0) {
        decrementBonusClaims();
      }

      // Update balance after a delay
      setTimeout(() => {
        updateBalance();
      }, 2000);
    } catch (error) {
      console.error("Error processing claim:", error);
      setStatus(
        `Error processing claim: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>BSV Faucet</h1>
      <div className="card">
        <FaucetInfo
          balance={walletBalance}
          faucetAddress={faucetAddress}
          copySuccess={walletCopySuccess}
          onCopyAddress={handleCopyAddress}
        />

        <AddressInput
          address={recipientAddress}
          onChange={setRecipientAddress}
          disabled={loading}
        />

        <ClaimButton
          onClaim={handleClaim}
          loading={loading}
          currentBonus={bonusSystemCurrentBonus}
          remainingBonusClaims={bonusSystemRemainingBonusClaims}
        />

        {status && <StatusMessage message={status} />}
        <SuccessNotification txid={successTxid} />
      </div>
      <footer className="footer">
        <a
          href="https://github.com/dnh33/simple-bsv-faucet"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Source{" "}
          <svg
            height="16"
            width="16"
            viewBox="0 0 16 16"
            style={{ fill: "currentColor" }}
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
          </svg>
        </a>
        <span className="separator">·</span>
        Built with ❤️ for the Bitcoin community
        <span className="separator">·</span>
        Salute to Null
      </footer>
    </div>
  );
}

export default App;
