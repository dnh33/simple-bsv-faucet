import { useState } from "react";
import { PrivateKey } from "@bsv/sdk";
import { FAUCET_PRIVATE_KEY } from "../utils/constants";

interface UseFaucetWalletReturn {
  privKey: PrivateKey;
  faucetAddress: ReturnType<PrivateKey["toAddress"]>;
  balance: number;
  setBalance: (balance: number) => void;
  copySuccess: boolean;
  handleCopyAddress: () => void;
}

export function useFaucetWallet(): UseFaucetWalletReturn {
  const [balance, setBalance] = useState<number>(0);
  const [copySuccess, setCopySuccess] = useState(false);

  // Initialize faucet wallet
  const privKey = PrivateKey.fromWif(FAUCET_PRIVATE_KEY);
  const faucetAddress = privKey.toAddress();

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(faucetAddress.toString());
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return {
    privKey,
    faucetAddress,
    balance,
    setBalance,
    copySuccess,
    handleCopyAddress,
  };
}
