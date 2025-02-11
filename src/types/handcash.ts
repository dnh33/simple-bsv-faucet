export interface HandCashProfile {
  handle: string;
  publicProfile: {
    displayName: string;
    avatarUrl: string;
    publicKey: string;
  };
}

export interface HandCashAccount {
  id: string;
  publicKey: string;
  paymail: string;
  displayName: string;
  avatarUrl: string;
  balance?: number;
}
