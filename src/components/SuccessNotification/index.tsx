import "../../styles/components/SuccessNotification.css";

interface SuccessNotificationProps {
  txid: string | null;
}

export function SuccessNotification({ txid }: SuccessNotificationProps) {
  if (!txid) return null;

  // Strip any surrounding quotes from the txid (both regular and URL-encoded)
  const cleanTxid = txid
    .replace(/^"(.*)"$/, '$1')  // Remove regular quotes
    .replace(/^%22(.*)%22$/, '$1')  // Remove URL-encoded quotes
    .replace(/%22/g, '');  // Remove any remaining URL-encoded quotes

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
