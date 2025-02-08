export interface UTXO {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
  scriptPubKey?: string;
}

interface TransactionOutput {
  value: number;
  address: string;
  scriptPubKey?: string;
}

export interface ClaimTransaction {
  txid: string;
  timestamp: number;
  outputs: TransactionOutput[];
}

export interface TransactionRecipient {
  address: string;
  amount: number;
}

export interface QueuedTransaction {
  id: string;
  recipients: TransactionRecipient[];
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  error?: string;
  txid?: string;
  username?: string;
}

export interface UseTransactionQueueProps {
  privateKey: string;
  sourceAddress: string;
  fetchUtxos: (address: string) => Promise<UTXO[]>;
}

export interface UseTransactionQueueReturn {
  queuedTransactions: QueuedTransaction[];
  addToQueue: (
    recipients: TransactionRecipient[],
    username?: string
  ) => QueuedTransaction;
  processQueue: () => Promise<void>;
  processTransaction: (transaction: QueuedTransaction) => Promise<void>;
  clearCompleted: () => void;
}
