import { useEffect, useState } from "react";
import {
  PrivateKey,
  Transaction,
  P2PKH,
  Script,
  SatoshisPerKilobyte,
} from "@bsv/sdk";
import "./App.css";

// Define UTXO interface based on WhatsOnChain response
interface UTXO {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
  scriptPubKey?: string;
}

// Constants
const FAUCET_AMOUNT = Number(import.meta.env.VITE_FAUCET_AMOUNT) || 1;
const WOC_API_URL = "https://api.whatsonchain.com/v1/bsv/main";
const BITAILS_API_URL = "https://api.bitails.io";
const FAUCET_IDENTIFIER = "BSVFaucet";

function App() {
  const [balance, setBalance] = useState<number>(0);
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [successTxid, setSuccessTxid] = useState<string | null>(null);

  // Initialize faucet wallet
  const privKey = PrivateKey.fromWif(
    import.meta.env.VITE_FAUCET_PRIVATE_KEY || ""
  );
  const faucetAddress = privKey.toAddress();

  useEffect(() => {
    updateBalance();
    const interval = setInterval(() => {
      updateBalance();
    }, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchUtxos = async (): Promise<UTXO[]> => {
    try {
      const address = faucetAddress.toString();
      console.log("Fetching UTXOs for address:", address);
      const response = await fetch(`${WOC_API_URL}/address/${address}/unspent`);
      if (!response.ok) {
        throw new Error(`WhatsOnChain API error: ${response.statusText}`);
      }
      const utxos = await response.json();
      console.log("Raw UTXOs response:", utxos);

      // Validate and filter UTXOs
      const validUtxos = utxos.filter((utxo: any) => {
        const isValid = utxo.tx_hash && utxo.tx_pos !== undefined && utxo.value;
        if (!isValid) {
          console.log("Invalid UTXO found:", utxo);
        }
        return isValid;
      });

      // Sort by confirmation count (most confirmed first)
      return validUtxos.sort((a: UTXO, b: UTXO) => b.height - a.height);
    } catch (error) {
      console.error("Error fetching UTXOs:", error);
      throw error;
    }
  };

  const fetchTransactionHex = async (txid: string): Promise<string> => {
    try {
      // Try Bitails first
      const response = await fetch(
        `${BITAILS_API_URL}/download/tx/${txid}/hex`,
        {
          headers: {
            "Content-Type": "application/gzip",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Bitails API error: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      // Convert buffer to string first
      const decoder = new TextDecoder();
      const hexString = decoder.decode(buffer);
      console.log("Fetched hex string:", hexString);
      return hexString;
    } catch (error) {
      console.error("Error fetching from Bitails:", error);
      // Fallback to WhatsOnChain if Bitails fails
      const response = await fetch(`${WOC_API_URL}/tx/${txid}/hex`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch source transaction: ${response.statusText}`
        );
      }
      const hexString = await response.text();
      console.log("Fetched hex string (fallback):", hexString);
      return hexString;
    }
  };

  const updateBalance = async () => {
    try {
      const utxos = await fetchUtxos();
      const balance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
      setBalance(balance);
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  };

  const handleClaim = async () => {
    if (!address) {
      setStatus("Please enter your BSV address");
      return;
    }

    setLoading(true);
    setStatus("Processing claim...");

    try {
      const utxos = await fetchUtxos();
      if (!utxos.length) {
        throw new Error("No confirmed UTXOs available");
      }

      // Calculate total input amount
      const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

      // Create transaction
      const tx = new Transaction();

      // Add inputs from confirmed UTXOs
      for (const utxo of utxos) {
        const sourceTxHex = await fetchTransactionHex(utxo.tx_hash);
        console.log("Creating source transaction from hex:", sourceTxHex);
        const sourceTransaction = Transaction.fromHex(sourceTxHex);
        console.log("Created source transaction:", sourceTransaction);

        tx.addInput({
          sourceTransaction,
          sourceOutputIndex: utxo.tx_pos,
          unlockingScriptTemplate: new P2PKH().unlock(privKey),
        });
      }

      // Add recipient output
      tx.addOutput({
        lockingScript: new P2PKH().lock(address),
        satoshis: FAUCET_AMOUNT,
      });

      // Add OP_RETURN output
      tx.addOutput({
        lockingScript: Script.fromASM(
          `OP_FALSE OP_RETURN ${stringToHex(FAUCET_IDENTIFIER)}`
        ),
        satoshis: 0,
      });

      // Calculate fee
      const feeModel = new SatoshisPerKilobyte(1); // 1 sat/kb
      const fee = await feeModel.computeFee(tx);
      console.log("Computed fee:", fee);

      // Ensure we have enough funds
      if (totalInput < FAUCET_AMOUNT + fee) {
        throw new Error(
          `Insufficient funds in faucet. Have: ${totalInput}, Need: ${
            FAUCET_AMOUNT + fee
          }`
        );
      }

      // Add change output if needed
      const changeAmount = totalInput - FAUCET_AMOUNT - fee;
      if (changeAmount > 0) {
        tx.addOutput({
          lockingScript: new P2PKH().lock(faucetAddress),
          satoshis: changeAmount,
        });
      }

      // Sign and broadcast
      console.log("Signing transaction...");
      await tx.sign();
      console.log("Broadcasting transaction...");
      const result = await tx.broadcast();
      console.log("Raw broadcast result:", result);
      console.log("Broadcast result type:", typeof result);
      if (!result) {
        throw new Error("Broadcast failed - no transaction ID returned");
      }

      // Get the transaction ID and convert it to hex string
      const txidBytes = tx.id();
      const txid = Array.from(txidBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      console.log("Transaction ID:", txid);
      console.log("Transaction ID type:", typeof txid);

      setSuccessTxid(txid);
      setStatus("");

      // Wait a moment before updating balance
      setTimeout(() => {
        updateBalance();
      }, 2000);
    } catch (error: any) {
      setSuccessTxid(null);
      console.error("Error processing claim:", error);
      const errorMessage = error.message || "Unknown error";
      const broadcastError = errorMessage.includes("Broadcast failed")
        ? "Transaction could not be broadcast to the network. Please try again."
        : errorMessage;
      setStatus(`Error processing claim: ${broadcastError}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(faucetAddress.toString());
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const stringToHex = (str: string): string => {
    return Array.from(str)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
  };

  return (
    <div className="App">
      <h1>BSV Faucet</h1>
      <div className="card">
        <div className="balance">
          Current Balance:{" "}
          <span className="balance-amount">{balance} satoshis</span>
        </div>

        <div className="faucet-info">
          <h2>Support the Faucet</h2>
          <p>Help keep this faucet running by sending some sats to:</p>
          <div className="address-container" onClick={handleCopyAddress}>
            <code className="faucet-address">{faucetAddress.toString()}</code>
            <button className="copy-button" type="button">
              {copySuccess ? (
                <span className="copied">Copied! ✓</span>
              ) : (
                <span>Copy Address</span>
              )}
            </button>
          </div>
        </div>

        <div className="input-group">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter your BSV address"
            disabled={loading}
          />
        </div>

        <button
          onClick={handleClaim}
          disabled={loading}
          className={loading ? "loading" : ""}
        >
          {loading ? "Processing..." : `Claim ${FAUCET_AMOUNT} satoshis`}
        </button>

        {successTxid && (
          <div className="notification success">
            🎉 Transaction successful!{" "}
            <a
              href={`https://whatsonchain.com/tx/${successTxid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-link"
            >
              View on WhatsOnChain →
            </a>
          </div>
        )}

        {status && (
          <p
            className={`status ${
              status.toLowerCase().includes("error") ? "error" : "warning"
            }`}
          >
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
