// UTXO interface based on WhatsOnChain response
export interface UTXO {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
  scriptPubKey?: string;
}

// Recent claim transaction interface
export interface ClaimTransaction {
  txid: string;
  timestamp: number;
  outputs: {
    value: number;
    address: string;
  }[];
}
