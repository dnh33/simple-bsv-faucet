// UTXO interface based on WhatsOnChain response
export interface UTXO {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
  scriptPubKey?: string;
}

export interface TransactionOutput {
  value: number;
  address: string;
  scriptPubKey?: string;
}

// Recent claim transaction interface
export interface ClaimTransaction {
  txid: string;
  timestamp: number;
  outputs: TransactionOutput[];
}

export interface WalletData {
  address: string;
  privateKey: string;
  publicKey: string;
  wif: string;
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
  isPromo?: boolean;
  timestamp: number;
}

// Squirt-related interfaces
export interface NewSquirt {
  sender_address: string;
  username: string;
  amount: number;
}

export interface SquirtStats {
  address: string;
  username: string;
  totalSquirts: number;
  totalSats: number;
  lastActive: number;
}

// Hook interfaces
export interface UseTransactionQueueProps {
  privateKey: string;
  sourceAddress: string;
  fetchUtxos: (address: string) => Promise<UTXO[]>;
  onSquirtComplete?: (squirt: NewSquirt) => void;
}

export interface UseTransactionQueueReturn {
  queuedTransactions: QueuedTransaction[];
  addToQueue: (
    recipients: TransactionRecipient[],
    username?: string,
    isPromo?: boolean
  ) => QueuedTransaction;
  processQueue: () => Promise<void>;
  processTransaction: (transaction: QueuedTransaction) => Promise<void>;
  clearCompleted: () => void;
}

export interface HandCashAccount {
  id: string;
  publicKey: string;
  paymail: string;
  displayName: string;
  avatarUrl: string;
  balance?: number;
}
