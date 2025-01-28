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
