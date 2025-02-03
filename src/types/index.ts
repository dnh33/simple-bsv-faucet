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
}
