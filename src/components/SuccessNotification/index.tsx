import "../../styles/components/SuccessNotification.css";

interface SuccessNotificationProps {
  txid: string | null;
}

export function SuccessNotification({ txid }: SuccessNotificationProps) {
  if (!txid) return null;

  // Strip any surrounding quotes from the txid
  const cleanTxid = txid.replace(/^"(.*)"$/, '$1');

  return (
    <div className="notification success">
      🎉 Transaction successful!{" "}
      <a
        href={`https://whatsonchain.com/tx/${cleanTxid}`}
        target="_blank"
        rel="noopener noreferrer"
        className="tx-link"
      >
        View on WhatsOnChain →
      </a>
    </div>
  );
}
