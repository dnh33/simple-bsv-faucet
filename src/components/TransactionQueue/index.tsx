import type { QueuedTransaction } from "../../types";
import "./TransactionQueue.css";

interface TransactionQueueProps {
  transactions: QueuedTransaction[];
  onClearCompleted: () => void;
}

export function TransactionQueue({
  transactions,
  onClearCompleted,
}: TransactionQueueProps) {
  if (transactions.length === 0) return null;

  const hasCompleted = transactions.some((tx) =>
    ["completed", "failed"].includes(tx.status)
  );

  return (
    <div className="transaction-queue">
      <div className="queue-header">
        <h3>Transaction Queue</h3>
        {hasCompleted && (
          <button onClick={onClearCompleted} className="clear-button">
            Clear Completed
          </button>
        )}
      </div>

      <div className="queue-list">
        {transactions.map((tx) => (
          <div key={tx.id} className={`queue-item ${tx.status}`}>
            <div className="item-header">
              <span className="status-badge">{tx.status}</span>
              {tx.txid && (
                <a
                  href={`https://whatsonchain.com/tx/${tx.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="txid-link"
                >
                  View Transaction →
                </a>
              )}
            </div>

            {tx.status === "processing" && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${tx.progress}%` }}
                />
              </div>
            )}

            <div className="recipients-list">
              {tx.recipients.map((recipient, index) => (
                <div key={index} className="recipient-item">
                  <code className="recipient-address">{recipient.address}</code>
                  <span className="recipient-amount">
                    {recipient.amount} sats
                  </span>
                </div>
              ))}
            </div>

            {tx.error && <div className="error-message">Error: {tx.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
