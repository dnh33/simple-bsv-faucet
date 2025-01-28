import "../../styles/components/FaucetInfo.css";

interface FaucetInfoProps {
  balance: number;
  faucetAddress: string;
  copySuccess: boolean;
  onCopyAddress: () => void;
}

export function FaucetInfo({
  balance,
  faucetAddress,
  copySuccess,
  onCopyAddress,
}: FaucetInfoProps) {
  return (
    <>
      <div className="balance">
        Current Balance:{" "}
        <span className="balance-amount">{balance} satoshis</span>
      </div>

      <div className="faucet-info">
        <h2>Support the Faucet</h2>
        <p>Help keep this faucet running by sending some sats to:</p>
        <div className="address-container" onClick={onCopyAddress}>
          <code className="faucet-address">{faucetAddress}</code>
          <button className="copy-button" type="button">
            {copySuccess ? (
              <span className="copied">Copied! ✓</span>
            ) : (
              <span>Copy Address</span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
