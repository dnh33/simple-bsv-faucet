import "../../styles/components/ClaimButton.css";
import { FAUCET_AMOUNT } from "../../utils/constants";

interface ClaimButtonProps {
  onClaim: () => void;
  loading: boolean;
  currentBonus: number;
  remainingBonusClaims: number;
}

export function ClaimButton({
  onClaim,
  loading,
  currentBonus,
  remainingBonusClaims,
}: ClaimButtonProps) {
  return (
    <button
      onClick={onClaim}
      disabled={loading}
      className={loading ? "loading" : ""}
    >
      {loading
        ? "Processing..."
        : `Claim ${FAUCET_AMOUNT}${
            remainingBonusClaims > 0 ? ` + ${currentBonus} bonus` : ""
          } satoshis`}
    </button>
  );
}
