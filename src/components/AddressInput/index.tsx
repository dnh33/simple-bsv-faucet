import "../../styles/components/AddressInput.css";

interface AddressInputProps {
  address: string;
  onChange: (address: string) => void;
  disabled?: boolean;
}

export function AddressInput({
  address,
  onChange,
  disabled = false,
}: AddressInputProps) {
  return (
    <div className="input-group">
      <input
        type="text"
        value={address}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your BSV address"
        disabled={disabled}
      />
    </div>
  );
}
