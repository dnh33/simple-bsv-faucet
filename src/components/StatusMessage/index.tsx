interface StatusMessageProps {
  message: string;
}

export function StatusMessage({ message }: StatusMessageProps) {
  if (!message) return null;

  return (
    <p
      className={`status ${
        message.toLowerCase().includes("error") ? "error" : "warning"
      }`}
    >
      {message}
    </p>
  );
}
