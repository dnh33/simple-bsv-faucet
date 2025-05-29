import { useEffect, useState } from "react";
import { useUTXOs, useBonusSystem } from "./utils/hooks";
import { logger } from "./utils/logger";
import JSConfetti from "js-confetti";

import { FaucetInfo } from "./components/FaucetInfo";
import { AddressInput } from "./components/AddressInput";
import { ClaimButton } from "./components/ClaimButton";
import { StatusMessage } from "./components/StatusMessage";
import { SuccessNotification } from "./components/SuccessNotification";
import { Footer } from "./components/Footer/Footer";

import "./styles/components";
import "./App.css";

// API endpoint for the Lambda function
const LAMBDA_API_ENDPOINT =
  "https://1yf0t1mwr1.execute-api.us-east-2.amazonaws.com/prod/claim";

function App() {
  // State
  const [recipientAddress, setRecipientAddress] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [successTxid, setSuccessTxid] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletCopySuccess, setWalletCopySuccess] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [nextClaimTime, setNextClaimTime] = useState(0);

  // Initialize confetti once
  const [jsConfetti] = useState(() => new JSConfetti());

  // Hardcoded faucet address
  const faucetAddress = "14mzuLyaY1nj8jBzb5AkLZniJUdiwTQXEw";

  // Initialize hooks
  const { updateBalance } = useUTXOs({
    faucetAddress,
    onBalanceUpdate: setWalletBalance,
  });
  const {
    currentBonus: bonusSystemCurrentBonus,
    remainingBonusClaims: bonusSystemRemainingBonusClaims,
    decrementBonusClaims,
  } = useBonusSystem();

  const handleCopyAddress = () => {
    logger.info(`Copying faucet address to clipboard: ${faucetAddress}`);
    navigator.clipboard.writeText(faucetAddress);
    setWalletCopySuccess(true);
    setTimeout(() => setWalletCopySuccess(false), 2000);
  };

  // Update balance periodically
  useEffect(() => {
    logger.info("Initializing balance update");
    updateBalance();
    const interval = setInterval(() => {
      logger.info("Periodic balance update triggered");
      updateBalance();
    }, 30000);
    return () => clearInterval(interval);
  }, [updateBalance]);

  // Countdown timer effect
  useEffect(() => {
    // Only run countdown if we have a future claim time
    if (nextClaimTime > Date.now()) {
      const initialSeconds = Math.ceil((nextClaimTime - Date.now()) / 1000);
      logger.info(
        `Starting countdown timer: ${initialSeconds} seconds remaining`
      );
      setCountdownSeconds(initialSeconds);

      const countdownInterval = setInterval(() => {
        const secondsLeft = Math.ceil((nextClaimTime - Date.now()) / 1000);

        if (secondsLeft <= 0) {
          logger.info("Countdown timer completed");
          setCountdownSeconds(0);
          clearInterval(countdownInterval);
        } else {
          setCountdownSeconds(secondsLeft);
        }
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [nextClaimTime]);

  const handleClaim = async () => {
    try {
      // If countdown is active, don't allow claim
      if (countdownSeconds > 0) {
        logger.info(
          `Claim attempted during countdown: ${countdownSeconds}s remaining`
        );
        setStatus(
          `Please wait ${countdownSeconds} seconds before claiming again.`
        );
        return;
      }

      logger.info(`Initiating claim to address: ${recipientAddress}`);
      setLoading(true);
      setStatus("");
      setSuccessTxid(null);

      // Validate inputs
      if (!recipientAddress) {
        logger.warn("Claim attempted with empty address");
        throw new Error("Please enter a BSV address");
      }

      // Call the Lambda function
      logger.info(`Calling Lambda function at: ${LAMBDA_API_ENDPOINT}`);
      const response = await fetch(LAMBDA_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address: recipientAddress }),
      });

      // Parse the response
      const result = await response.json();
      logger.info(`Lambda response status: ${response.status}`, result);

      // Handle rate limiting errors
      if (response.status === 429 && result.remainingTime) {
        logger.warn(`Rate limited: ${result.remainingTime}s remaining`, {
          address: recipientAddress,
        });
        setCountdownSeconds(result.remainingTime);
        setNextClaimTime(Date.now() + result.remainingTime * 1000);
        throw new Error(result.error);
      }

      // Handle other errors
      if (!response.ok) {
        logger.error(`API error: ${response.status}`, result);
        throw new Error(result.error || "Failed to process claim");
      }

      // Update UI with success
      logger.info(`Claim successful! TXID: ${result.txid}`);
      setSuccessTxid(result.txid);

      // Start countdown for next claim
      if (result.nextClaimTime) {
        logger.info(
          `Setting next claim time: ${new Date(
            result.nextClaimTime
          ).toISOString()}`
        );
        setNextClaimTime(result.nextClaimTime);
      }

      // Apply bonus if available
      if (bonusSystemRemainingBonusClaims > 0) {
        logger.info(
          `Applying bonus: ${bonusSystemCurrentBonus} satoshis, ${
            bonusSystemRemainingBonusClaims - 1
          } claims remaining`
        );
        decrementBonusClaims();
      }

      // Update balance after a delay
      setTimeout(() => {
        logger.info("Updating balance after successful claim");
        updateBalance();
      }, 2000);

      // Trigger celebratory confetti with crypto theme
      const celebrateSuccess = async () => {
        // First burst - money and celebration emojis
        await jsConfetti.addConfetti({
          emojis: ['💰', '🎉', '💎', '🚀', '✨', '💫'],
          emojiSize: 50,
          confettiNumber: 40,
        });
        
        // Second burst - Bitcoin/BSV themed
        setTimeout(() => {
          jsConfetti.addConfetti({
            emojis: ['₿', '💸', '🏆', '🌟'],
            emojiSize: 60,
            confettiNumber: 25,
          });
        }, 300);
        
        // Third burst - traditional confetti colors (BSV orange/gold theme)
        setTimeout(() => {
          jsConfetti.addConfetti({
            confettiColors: [
              '#ff6b35', '#ff8c42', '#ffa726', '#ffb74d', 
              '#ffcc02', '#ffd700', '#ffffff', '#f5f5f5'
            ],
            confettiNumber: 100,
            confettiRadius: 8,
          });
        }, 600);
      };
      
      celebrateSuccess();
    } catch (error) {
      logger.error("Error processing claim:", error);
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
          countdownSeconds={countdownSeconds}
        />

        {status && <StatusMessage message={status} />}
        <SuccessNotification txid={successTxid} />
      </div>
      <Footer />
    </div>
  );
}

export default App;
