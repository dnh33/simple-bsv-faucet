import "../../styles/components/ClaimButton.css";
import { FAUCET_AMOUNT } from "../../utils/constants";

interface ClaimButtonProps {
  onClaim: () => void;
  loading: boolean;
  currentBonus: number;
  remainingBonusClaims: number;
  countdownSeconds: number;
}

export function ClaimButton({
  onClaim,
  loading,
  currentBonus,
  remainingBonusClaims,
  countdownSeconds,
}: ClaimButtonProps) {
  // Determine the button text based on state
  let buttonText: string;

  if (loading) {
    buttonText = "Processing...";
  } else if (countdownSeconds > 0) {
    buttonText = `Wait ${countdownSeconds}s`;
  } else {
    buttonText = `Claim ${FAUCET_AMOUNT}${
      remainingBonusClaims > 0 ? ` + ${currentBonus} bonus` : ""
    } satoshis`;
  }

  // Determine button class for styling
  const buttonClass = `claim-button ${
    loading ? "loading" : countdownSeconds > 0 ? "countdown" : ""
  }`.trim();

  return (
    <button
      onClick={onClaim}
      disabled={loading || countdownSeconds > 0}
      className={buttonClass}
    >
      {buttonText}
    </button>
  );
}
