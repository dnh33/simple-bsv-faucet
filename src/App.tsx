import { useState, useEffect } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import {
  PrivateKey,
  P2PKH,
  Transaction,
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

interface ClaimTransaction {
  txid: string;
  timestamp: string;
  outputs: Array<{
    value: number;
    scriptPubKey?: {
      addresses?: string[];
      asm?: string;
    };
  }>;
}

// Constants
const FAUCET_AMOUNT = Number(import.meta.env.VITE_FAUCET_AMOUNT) || 1000;
const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY || "";
const WOC_API_URL = "https://api.whatsonchain.com/v1/bsv/main";
const BITAILS_API_URL = "https://api.bitails.io";
const FAUCET_IDENTIFIER = "bsv-faucet"; // Used in OP_RETURN
const IS_LOCALHOST =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// Helper function to convert string to hex (for OP_RETURN)
const stringToHex = (str: string): string => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// Helper function to fetch transaction hex from Bitails
const fetchTransactionHex = async (txid: string): Promise<string> => {
  try {
    const response = await fetch(`${BITAILS_API_URL}/download/tx/${txid}/hex`, {
      headers: {
        "Content-Type": "application/gzip",
      },
    });

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

function App() {
  const [balance, setBalance] = useState<number>(0);
  const [address, setAddress] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentClaims, setRecentClaims] = useState<ClaimTransaction[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);

  // Initialize faucet wallet - private key from environment variable
  const privKey = PrivateKey.fromWif(
    import.meta.env.VITE_FAUCET_PRIVATE_KEY || ""
  );
  const faucetAddress = privKey.toAddress();

  useEffect(() => {
    updateBalance();
    fetchRecentClaims();
    const interval = setInterval(() => {
      updateBalance();
      fetchRecentClaims();
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

      // Validate UTXO data
      if (!Array.isArray(utxos)) {
        throw new Error("Invalid UTXO response format");
      }

      const validUtxos = utxos.filter((utxo) => {
        const isValid =
          utxo &&
          typeof utxo.tx_hash === "string" &&
          typeof utxo.tx_pos === "number" &&
          typeof utxo.value === "number";

        if (!isValid) {
          console.warn("Invalid UTXO found:", utxo);
        }
        return isValid;
      });

      console.log("Validated UTXOs:", validUtxos);
      return validUtxos;
    } catch (error) {
      console.error("Error fetching UTXOs:", error);
      return [];
    }
  };

  const fetchRecentClaims = async () => {
    try {
      const address = faucetAddress.toString();
      const response = await fetch(`${WOC_API_URL}/address/${address}/history`);
      if (!response.ok) {
        throw new Error(`WhatsOnChain API error: ${response.statusText}`);
      }
      const history = await response.json();

      // Filter transactions with our OP_RETURN identifier
      const claims = await Promise.all(
        history.map(async (tx: { tx_hash: string }) => {
          const txResponse = await fetch(
            `${WOC_API_URL}/tx/hash/${tx.tx_hash}`
          );
          const txData = await txResponse.json();
          // Check if transaction has our OP_RETURN identifier
          const hasIdentifier = txData.vout.some((out: any) =>
            out.scriptPubKey?.asm?.includes(FAUCET_IDENTIFIER)
          );
          if (hasIdentifier) {
            return {
              txid: tx.tx_hash,
              timestamp: txData.time,
              outputs: txData.vout,
            };
          }
          return null;
        })
      );
      setRecentClaims(claims.filter(Boolean));
    } catch (error) {
      console.error("Error fetching claims:", error);
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

  const checkRecentClaim = (claimAddress: string): boolean => {
    // Check if address has claimed in the last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return recentClaims.some((claim) => {
      const claimTime = new Date(claim.timestamp).getTime();
      return (
        claimTime > oneDayAgo &&
        claim.outputs.some((out) =>
          out.scriptPubKey?.addresses?.includes(claimAddress)
        )
      );
    });
  };

  const handleClaim = async () => {
    if (!address) {
      setStatus("Please enter your BSV address");
      return;
    }

    if (!IS_LOCALHOST && !captchaToken) {
      setStatus("Please complete the captcha");
      return;
    }

    if (checkRecentClaim(address)) {
      setStatus("Address has already claimed in the last 24 hours");
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
      const feeModel = new SatoshisPerKilobyte(1); // Back to 1000 sats/kb
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
      console.log("Broadcast result:", result);
      if (!result) {
        throw new Error("Broadcast failed - no transaction ID returned");
      }
      const txid = result.toString();
      console.log("Transaction ID:", txid);

      setStatus(
        `Success! View transaction: https://whatsonchain.com/tx/${txid}`
      );
      // Wait a moment before updating balance and claims to allow for propagation
      setTimeout(() => {
        updateBalance();
        fetchRecentClaims();
      }, 2000);
    } catch (error: any) {
      console.error("Error processing claim:", error);
      // Add more context to the error message if it's from broadcasting
      const errorMessage = error.message || "Unknown error";
      const broadcastError = errorMessage.includes("Broadcast failed")
        ? "Transaction could not be broadcast to the network. Please try again."
        : errorMessage;
      setStatus(`Error processing claim: ${broadcastError}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(faucetAddress.toString());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
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

        {!IS_LOCALHOST && (
          <div className="h-captcha">
            <HCaptcha
              sitekey={HCAPTCHA_SITE_KEY}
              onVerify={(token) => setCaptchaToken(token)}
            />
          </div>
        )}

        <button
          onClick={handleClaim}
          disabled={loading || (!IS_LOCALHOST && !captchaToken)}
          className={loading ? "loading" : ""}
        >
          {loading ? "Processing..." : `Claim ${FAUCET_AMOUNT} satoshis`}
        </button>

        {status && (
          <p
            className={`status ${
              status.toLowerCase().includes("success")
                ? "success"
                : status.toLowerCase().includes("error")
                ? "error"
                : "warning"
            }`}
          >
            {status}
          </p>
        )}

        <div className="recent-claims">
          <h2>Recent Claims</h2>
          <ul className="claims-list">
            {recentClaims.map((claim) => (
              <li key={claim.txid}>
                <a
                  href={`https://whatsonchain.com/tx/${claim.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {new Date(claim.timestamp).toLocaleString()}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
