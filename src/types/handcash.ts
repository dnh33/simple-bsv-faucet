export interface UserPublicProfile {
  handle: string;
  displayName: string;
  avatarUrl: string;
  publicKey: string;
}

export interface HandCashProfile {
  handle: string;
  publicProfile: UserPublicProfile;
}

export interface HandCashAccount {
  id: string;
  publicKey: string;
  paymail: string;
  displayName: string;
  avatarUrl: string;
  balance?: number;
}
