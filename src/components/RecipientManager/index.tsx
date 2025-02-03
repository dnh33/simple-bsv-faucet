import { useState } from "react";
import type { TransactionRecipient } from "../../types";
import "./RecipientManager.css";

interface RecipientManagerProps {
  onAddRecipients: (recipients: TransactionRecipient[]) => void;
  disabled?: boolean;
}

export function RecipientManager({
  onAddRecipients,
  disabled = false,
}: RecipientManagerProps) {
  const [recipientCount, setRecipientCount] = useState(1);
  const [recipients, setRecipients] = useState<TransactionRecipient[]>([
    { address: "", amount: 1 },
  ]);
  const [error, setError] = useState<string | null>(null);

  const handleCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const count = Math.max(1, Math.min(10, Number(event.target.value)));
    setRecipientCount(count);

    setRecipients((prev) => {
      if (count > prev.length) {
        return [
          ...prev,
          ...Array(count - prev.length).fill({ address: "", amount: 1 }),
        ];
      }
      return prev.slice(0, count);
    });
  };

  const handleRecipientChange = (
    index: number,
    field: keyof TransactionRecipient,
    value: string | number
  ) => {
    setRecipients((prev) =>
      prev.map((recipient, i) =>
        i === index ? { ...recipient, [field]: value } : recipient
      )
    );
  };

  const handleSubmit = () => {
    // Validate all recipients
    const invalidRecipients = recipients.filter(
      (r) => !r.address || r.amount < 1
    );
    if (invalidRecipients.length > 0) {
      setError("All recipients must have an address and at least 1 satoshi");
      return;
    }

    onAddRecipients(recipients);

    // Reset form
    setRecipients([{ address: "", amount: 1 }]);
    setRecipientCount(1);
    setError(null);
  };

  return (
    <div className="recipient-manager">
      <div className="recipient-count">
        <label htmlFor="recipient-count">Number of Recipients:</label>
        <input
          id="recipient-count"
          type="number"
          min="1"
          max="10"
          value={recipientCount}
          onChange={handleCountChange}
          disabled={disabled}
        />
      </div>

      <div className="recipients-form">
        {recipients.map((recipient, index) => (
          <div key={index} className="recipient-row">
            <div className="input-group">
              <label htmlFor={`address-${index}`}>Address:</label>
              <input
                id={`address-${index}`}
                type="text"
                value={recipient.address}
                onChange={(e) =>
                  handleRecipientChange(index, "address", e.target.value)
                }
                placeholder="Enter BSV address"
                disabled={disabled}
              />
            </div>
            <div className="input-group">
              <label htmlFor={`amount-${index}`}>Amount (sats):</label>
              <input
                id={`amount-${index}`}
                type="number"
                min="1"
                value={recipient.amount}
                onChange={(e) =>
                  handleRecipientChange(index, "amount", Number(e.target.value))
                }
                disabled={disabled}
              />
            </div>
          </div>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={disabled}
        className="submit-button"
      >
        Add to Queue
      </button>
    </div>
  );
}
