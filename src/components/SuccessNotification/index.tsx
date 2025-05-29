import "../../styles/components/SuccessNotification.css";

interface SuccessNotificationProps {
  txid: string | null;
}

export function SuccessNotification({ txid }: SuccessNotificationProps) {
  if (!txid) return null;

  // Ensure txid is a string before processing
  const txidString = typeof txid === 'string' ? txid : String(txid);

  // Strip any quotes from the txid - handle all possible quote scenarios
  let cleanTxid = txidString;
  
  // Remove all types of quotes and URL encoding
  cleanTxid = cleanTxid
    .replace(/['"]/g, '')        // Remove all single and double quotes
    .replace(/%22/g, '')         // Remove URL-encoded quotes
    .replace(/%27/g, '')         // Remove URL-encoded single quotes
    .trim();                     // Remove whitespace

  console.log('Original txid:', txid);
  console.log('Clean txid:', cleanTxid);

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
