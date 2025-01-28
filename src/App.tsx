import { useEffect, useState } from "react";
import { Transaction, P2PKH, Script, SatoshisPerKilobyte, OP } from "@bsv/sdk";
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
      const tx = new Transaction();

      // Add inputs from confirmed UTXOs
      for (const utxo of utxos) {
        try {
          const hexString = await fetchTransactionHex(utxo.tx_hash);
          console.log("Using hex string for input:", hexString);
          const sourceTransaction = Transaction.fromHex(hexString);
          tx.addInput({
            sourceTransaction,
            sourceOutputIndex: utxo.tx_pos,
            unlockingScriptTemplate: new P2PKH().unlock(privateKey),
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

      // Sign transaction
      await tx.sign();

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
    </div>
  );
}

export default App;
