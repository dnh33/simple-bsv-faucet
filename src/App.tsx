import { useState, useEffect, useRef } from "react";
import {
  Copy,
  Plus,
  Upload,
  RefreshCw,
  X,
  MessageCircle,
  Palette,
  Check,
  Download,
} from "lucide-react";
import { PrivateKey } from "@bsv/sdk";
import { useTransactionQueue } from "./hooks/useTransactionQueue";
import { useWalletBalance } from "./hooks/useWalletBalance";
import { useWalletGeneration } from "./hooks/useWalletGeneration";
import { fetchUtxos } from "./services/api";
import { Leaderboard } from "./components/Leaderboard";
import { useSquirtStats } from "./hooks/useSquirtStats";
import { useHandCashConnect } from "./hooks/useHandCashConnect";
import { useHandCashWallet } from "./hooks/useHandCashWallet";
import "./App.css";
import { Toaster, toast } from "react-hot-toast";
import { handcashStore } from "./stores/handcash";
import { logger } from "./utils/logger";
import { useStore } from "@nanostores/react";
import type { Theme } from "./types/theme";

function App() {
  const { connect: connectHandcash, disconnect: disconnectHandcash } =
    useHandCashConnect();
  const { wallet: handcashWallet, sendTransaction: sendHandcashTransaction } =
    useHandCashWallet();
  const handcashAccount = useStore(handcashStore).account;
  const [isConnectingHandcash] = useState(false);

  // Theme state
  const [theme, setTheme] = useState<Theme>("aqua");
  const [showThemeSelector, setShowThemeSelector] = useState(false);

  // BSV SDK hooks
  const { wallet, generateWallet, importWallet, exportWallet } =
    useWalletGeneration();

  const { balance } = useWalletBalance(wallet?.address || null);
  const { stats } = useSquirtStats();
  const {
    queuedTransactions: transactions,
    addToQueue,
    processTransaction,
    clearCompleted,
  } = useTransactionQueue({
    privateKey: wallet?.wif || "",
    sourceAddress: wallet?.address || "",
    fetchUtxos: fetchUtxos,
  });

  // UI state
  const [recipientCount, setRecipientCount] = useState<number>(1);
  const [recipients, setRecipients] = useState<
    { address: string; amount: number }[]
  >([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayBalance, setDisplayBalance] = useState(0);
  const previousBalance = useRef(0);
  const [username, setUsername] = useState<string>("");
  const [isPromo, setIsPromo] = useState(false);

  const t = themes[theme];

  // Calculate completed transactions
  const completedCount = transactions.filter(
    (tx) => tx.status === "completed"
  ).length;

  // Smooth balance update effect with animation
  useEffect(() => {
    if (typeof balance !== "number") return;

    const startValue = previousBalance.current;
    const endValue = balance;
    const duration = 500; // Animation duration in ms
    const startTime = performance.now();

    const updateValue = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(
        startValue + (endValue - startValue) * easeOutCubic
      );

      setDisplayBalance(currentValue);

      if (progress < 1) {
        requestAnimationFrame(updateValue);
      } else {
        previousBalance.current = endValue;
      }
    };

    requestAnimationFrame(updateValue);
  }, [balance]);

  const handleCopyWalletAddress = async () => {
    if (!wallet?.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopySuccess(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      toast.error("Failed to copy address");
      logger.error("Failed to copy address:", error);
    }
  };

  useEffect(() => {
    const generateRecipients = () => {
      try {
        const newRecipients = Array.from({ length: recipientCount }, () => {
          const recipientKey = PrivateKey.fromRandom();
          const recipientAddress = recipientKey.toAddress().toString();
          return {
            address: recipientAddress,
            amount: 1, // 1 sat per recipient
          };
        });
        setRecipients(newRecipients);
      } catch (error) {
        logger.error("Failed to generate recipient addresses:", error);
      }
    };

    generateRecipients();
  }, [recipientCount]);

  const handleCreateWallet = async () => {
    setIsGenerating(true);
    try {
      await generateWallet();
      toast.success("New wallet generated successfully");
    } catch (error) {
      toast.error("Failed to generate wallet");
      logger.error("Failed to generate wallet:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsGenerating(true);
    try {
      const text = await file.text();
      const walletData = JSON.parse(text);

      if (!walletData.wif) {
        throw new Error("Invalid wallet file format");
      }

      const success = importWallet(walletData.wif);
      if (success) {
        toast.success("Wallet imported successfully");
      }
    } catch (error) {
      toast.error("Failed to import wallet");
      logger.error("Failed to import wallet:", error);
    } finally {
      setIsGenerating(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  // Use HandCash wallet if available, otherwise use BSV SDK wallet
  const activeWallet = handcashWallet || wallet;
  const activeBalance = handcashWallet
    ? handcashAccount?.balance || 0
    : balance;

  const handleSendTransactions = async () => {
    if (!activeWallet || recipients.length === 0) return;

    // Prevent double-clicking
    if (isProcessing) return;

    // Calculate total amount needed (including estimated fees)
    const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0);

    // Check if we have enough balance
    if (activeBalance < totalAmount) {
      toast.error("Insufficient balance for transactions");
      return;
    }

    setIsProcessing(true);

    try {
      // Create all transaction queue entries upfront
      const queuedTxs = recipients.map((recipient) =>
        addToQueue(
          [recipient],
          username.trim() || (handcashAccount?.displayName ?? undefined),
          isPromo
        )
      );

      if (handcashWallet) {
        try {
          // Send through HandCash one at a time
          for (const recipient of recipients) {
            const txid = await sendHandcashTransaction(
              [recipient], // Send single recipient
              username.trim() || (handcashAccount?.displayName ?? undefined),
              isPromo
            );

            // Update transaction status
            const tx = queuedTxs.find(
              (t) => t.recipients[0]?.address === recipient.address
            );
            if (tx) {
              tx.status = "completed";
              tx.txid = txid;
            }
          }
        } catch (error) {
          // Mark all transactions as failed if HandCash transaction fails
          queuedTxs.forEach((tx) => {
            tx.status = "failed";
            tx.error =
              error instanceof Error ? error.message : "Transaction failed";
          });
          throw error;
        }
      } else {
        // Process each transaction using BSV SDK
        for (const tx of queuedTxs) {
          await processTransaction(tx);
        }
      }

      // Generate new recipient immediately
      const newRecipientKey = PrivateKey.fromRandom();
      const newRecipientAddress = newRecipientKey.toAddress().toString();
      setRecipients([
        {
          address: newRecipientAddress,
          amount: 1,
        },
      ]);
      setRecipientCount(1); // Reset recipient count after successful transaction
    } catch (error) {
      toast.error("Failed to process transaction");
      logger.error("Failed to process transaction:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Rest of the UI code from the sample, but using our SDK variables
  return (
    <div
      className={`min-h-screen flex flex-col ${t.bg} ${t.text} p-2 sm:p-4 transition-colors duration-300 relative overflow-hidden`}
    >
      <Toaster
        position="top-right"
        toastOptions={{
          className: "dark:bg-gray-800 dark:text-white",
          duration: 3000,
          success: {
            iconTheme: {
              primary: "#1CF567",
              secondary: "white",
            },
          },
        }}
      />
      {/* Theme accessibility background */}
      {theme === "accessibility" && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none select-none">
          <div className="absolute -right-20 top-1/4 text-[400px] opacity-[0.25] transform -rotate-12 text-blue-400">
            ♿
          </div>
          <div className="absolute -left-20 bottom-1/4 text-[350px] opacity-[0.25] transform rotate-12 text-blue-400">
            ♿
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-grow relative z-10">
        {/* Theme switcher */}
        <div className="fixed top-2 sm:top-4 right-2 sm:right-4 z-10">
          <button
            onClick={() => setShowThemeSelector(!showThemeSelector)}
            className={`p-2.5 sm:p-3.5 rounded-full ${t.button} transition-colors shadow-lg cursor-pointer hover:cursor-pointer`}
          >
            <Palette className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          {showThemeSelector && (
            <div
              className={`absolute right-0 mt-3 ${t.glass} rounded-lg shadow-lg p-3 ${t.border} border w-52`}
            >
              <button
                onClick={() => setTheme("aqua")}
                className="w-full text-left px-4 py-2.5 rounded hover:bg-black/10 transition-colors cursor-default hover:cursor-pointer active:cursor-pointer"
              >
                🌊 Aqua Theme
              </button>
              <button
                onClick={() => setTheme("rainbow")}
                className="w-full text-left px-4 py-2.5 rounded hover:bg-black/10 transition-colors cursor-default hover:cursor-pointer active:cursor-pointer"
              >
                🌈 Rainbow Theme
              </button>
              <button
                onClick={() => setTheme("accessibility")}
                className="w-full text-left px-4 py-2.5 rounded hover:bg-black/10 transition-colors cursor-default hover:cursor-pointer active:cursor-pointer"
              >
                ♿ Accessibility Theme
              </button>
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className="max-w-[calc(72rem-60px)] mx-auto space-y-6 sm:space-y-10 px-4 sm:px-6">
          {/* Header section */}
          <div className="relative p-8 sm:p-10 overflow-hidden">
            {/* Animated background pattern - only for aqua theme */}
            {theme === "aqua" && (
              <div className="absolute inset-0 -z-20 overflow-hidden">
                <div className="absolute w-full h-full">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute rounded-full bg-cyan-500/5"
                      style={{
                        width: `${Math.random() * 20 + 10}rem`,
                        height: `${Math.random() * 20 + 10}rem`,
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        transform: `scale(${Math.random() * 0.5 + 0.5})`,
                        animation: `float ${
                          Math.random() * 10 + 20
                        }s infinite linear`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-10 relative">
              {/* Logo section - keeping original logo and effects */}
              <div className="w-full lg:w-auto">
                <div className="relative w-fit">
                  <img
                    src={t.logo}
                    alt="Splashing Sats Logo"
                    className="h-28 sm:h-36 lg:h-44 w-auto object-contain relative z-10"
                  />
                  {theme === "aqua" && (
                    <>
                      {/* Main splash effect */}
                      <div className="absolute inset-0 -z-10">
                        <div className="absolute inset-0 animate-splash-wave">
                          <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/40 to-blue-500/40 rounded-full transform-gpu rotate-3d(1, 2, 1, 45deg) scale-y-50 blur-xl"></div>
                        </div>
                        {/* Multiple water droplets */}
                        <div className="absolute inset-0">
                          {[...Array(6)].map((_, i) => (
                            <div
                              key={i}
                              className={`absolute w-4 h-4 rounded-full bg-cyan-400/60 blur-sm
                                animate-droplet-${i + 1} transform-gpu`}
                              style={{
                                left: `${20 + i * 15}%`,
                                top: `${30 + (i % 3) * 20}%`,
                                animationDelay: `${i * 0.2}s`,
                              }}
                            ></div>
                          ))}
                        </div>
                        {/* Ripple effects */}
                        <div className="absolute inset-0">
                          {[...Array(3)].map((_, i) => (
                            <div
                              key={i}
                              className={`absolute inset-0 border-4 border-blue-400/20 rounded-full
                                animate-ripple transform-gpu scale-100 blur-sm`}
                              style={{
                                animationDelay: `${i * 0.5}s`,
                              }}
                            ></div>
                          ))}
                        </div>
                      </div>
                      {/* 3D perspective container */}
                      <div className="absolute inset-0 -z-20">
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-cyan-400/20 to-blue-500/20 
                          rounded-full transform-gpu rotate-3d(2, 1, 1, 60deg) scale-150 animate-perspective-shift blur-lg"
                        ></div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Enhanced content section */}
              <div className="flex-1 space-y-8">
                {/* Main hero content with improved typography and layout */}
                <div
                  className={`space-y-6 ${t.card} rounded-2xl p-8 ${t.border} border shadow-xl backdrop-blur-lg`}
                >
                  <div className="space-y-4">
                    <h1
                      className={`text-4xl sm:text-5xl font-bold bg-gradient-to-r ${t.accent} text-transparent bg-clip-text pb-2`}
                    >
                      Squirting satoshis,
                      <span className="block">one at a time.</span>
                    </h1>

                    <div className="h-1 w-24 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"></div>

                    <p
                      className={`${t.textMuted} text-lg sm:text-xl leading-relaxed max-w-2xl`}
                    >
                      Squirting Sats lets you distribute Bitcoin SV across the
                      network, creating tiny treasure troves that might change
                      someone's life in the future.
                    </p>
                  </div>

                  {/* Network Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6">
                    <div className={`${t.cardDark} p-4 rounded-xl text-center`}>
                      <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text mb-2">
                        {stats
                          .reduce((sum, stat) => sum + stat.totalSquirts, 0)
                          .toLocaleString()}
                      </div>
                      <div className={`${t.textMuted} text-sm`}>
                        Total Squirts
                      </div>
                    </div>
                    <div className={`${t.cardDark} p-4 rounded-xl text-center`}>
                      <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text mb-2">
                        {stats
                          .reduce((sum, stat) => sum + stat.totalSats, 0)
                          .toLocaleString()}
                      </div>
                      <div className={`${t.textMuted} text-sm`}>
                        Sats Distributed
                      </div>
                    </div>
                    <div className={`${t.cardDark} p-4 rounded-xl text-center`}>
                      <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text mb-2">
                        {stats.length.toLocaleString()}
                      </div>
                      <div className={`${t.textMuted} text-sm`}>
                        Active Squirters
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mission Statement */}
                <div
                  className={`${t.cardDark} p-6 rounded-xl border ${t.border} backdrop-blur-sm`}
                >
                  <p className={`${t.textMuted} text-lg leading-relaxed`}>
                    Every satoshi we squirt today could be tomorrow's
                    life-changing discovery. Join us in our mission to spread
                    opportunity and value across the blockchain.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Wallet section */}
          <div
            className={`${t.card} rounded-2xl p-6 sm:p-8 ${t.border} border shadow-xl`}
          >
            <h2 className="text-xl sm:text-2xl font-semibold mb-6">Wallet</h2>
            <div className="space-y-6">
              {/* Wallet Generation/Import Buttons */}
              {!activeWallet && (
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                  <button
                    onClick={handleCreateWallet}
                    disabled={isGenerating}
                    className={`flex-1 py-4 rounded-xl ${t.button} transition-colors flex items-center justify-center gap-3 disabled:opacity-50 cursor-default hover:cursor-pointer active:cursor-pointer`}
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-6 h-6 animate-spin" />
                        <span className="text-lg">Generating...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-6 h-6" />
                        <span className="text-lg">Generate New Wallet</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleImportClick}
                    disabled={isGenerating}
                    className={`flex-1 py-4 rounded-xl ${t.buttonAlt} transition-colors flex items-center justify-center gap-3 disabled:opacity-50 cursor-default hover:cursor-pointer active:cursor-pointer`}
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-lg">Import Wallet</span>
                  </button>
                </div>
              )}

              {/* HandCash Connect Button */}
              {!handcashAccount && !activeWallet && (
                <button
                  onClick={connectHandcash}
                  disabled={isGenerating || isConnectingHandcash}
                  className={`w-full py-4 rounded-xl bg-gradient-to-r from-[#0a3a1c] via-[#0d4423] to-[#0a3a1c] hover:from-[#0d4423] hover:via-[#0f4d28] hover:to-[#0d4423] text-white font-medium transition-all flex items-center justify-center gap-3 disabled:opacity-50 cursor-default hover:cursor-pointer active:cursor-pointer shadow-lg hover:shadow-xl hover:scale-[1.02] border border-[#1CF567]/20`}
                >
                  {isConnectingHandcash ? (
                    <>
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <span className="text-lg">Connecting...</span>
                    </>
                  ) : (
                    <>
                      <img
                        src="/images/handcash-icon.svg"
                        alt=""
                        className="w-6 h-6 opacity-90"
                      />
                      <span className="text-lg">Connect HandCash</span>
                    </>
                  )}
                </button>
              )}

              {/* Connected Wallets Display */}
              {(activeWallet || handcashAccount) && (
                <div className="space-y-6">
                  {/* BSV SDK Wallet - Only show if HandCash is not connected */}
                  {activeWallet && !handcashAccount && (
                    <div className={`${t.bg} p-6 rounded-xl`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-2xl font-semibold ${
                              theme === "accessibility"
                                ? "text-blue-900"
                                : "text-white"
                            }`}
                          >
                            Current Balance:
                          </span>
                          <span className="text-2xl font-semibold">
                            {displayBalance} satoshis
                          </span>
                        </div>
                        <button
                          onClick={exportWallet}
                          className={`px-4 py-2 ${t.buttonAlt} rounded-xl transition-colors flex items-center gap-2 cursor-default hover:cursor-pointer active:cursor-pointer`}
                          title="Export Wallet"
                        >
                          <span>Export Wallet</span>
                          <Download className="w-5 h-5" />
                        </button>
                      </div>
                      <div
                        className={`flex items-center justify-between ${t.cardDark} p-4 rounded-xl`}
                      >
                        <code className="text-sm sm:text-base font-mono truncate mr-3">
                          {activeWallet.address}
                        </code>
                        <button
                          onClick={handleCopyWalletAddress}
                          className={`p-3 ${t.buttonAlt} rounded-xl transition-colors flex-shrink-0 cursor-default hover:cursor-pointer active:cursor-pointer`}
                        >
                          {copySuccess ? (
                            <Check className="w-5 h-5 text-green-500" />
                          ) : (
                            <Copy className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* HandCash Account */}
                  {handcashAccount && (
                    <div className={`${t.bg} p-6 rounded-xl`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="relative">
                            <img
                              src={handcashAccount.avatarUrl}
                              alt={handcashAccount.displayName}
                              className="w-12 h-12 rounded-full ring-2 ring-[#1CF567]/20"
                            />
                            <img
                              src="/images/handcash-icon.svg"
                              alt="HandCash"
                              className="absolute -bottom-1 -right-1 w-5 h-5 opacity-90 bg-[#0a3a1c] rounded-full p-0.5 ring-2 ring-[#1CF567]/20"
                            />
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-3 mb-2">
                              <span
                                className={`text-xl font-semibold ${
                                  theme === "accessibility"
                                    ? "text-blue-900"
                                    : "text-white"
                                }`}
                              >
                                {handcashAccount.displayName}
                              </span>
                            </div>
                            <span
                              className={`${t.textMuted} text-sm font-mono mt-0.5`}
                            >
                              {handcashAccount.paymail}
                            </span>
                            <span
                              className={`${
                                theme === "accessibility"
                                  ? "text-blue-900"
                                  : "text-white"
                              } text-lg font-medium mt-2`}
                            >
                              Balance:{" "}
                              <span className="font-semibold">
                                {handcashAccount.balance?.toLocaleString() ||
                                  "0"}
                              </span>{" "}
                              satoshis
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                          <div
                            className={`inline-flex items-center gap-3 ${t.cardDark} py-2 px-4 rounded-xl`}
                          >
                            <span
                              className={`${t.textMuted} font-medium text-sm`}
                            >
                              Total Squirts
                            </span>
                            <div
                              className={`h-4 w-px ${t.border} opacity-30`}
                            ></div>
                            <span
                              className={`text-xl font-bold ${
                                theme === "accessibility"
                                  ? "text-blue-900"
                                  : `bg-gradient-to-r ${t.accent} text-transparent bg-clip-text`
                              }`}
                            >
                              {stats.find(
                                (s) =>
                                  s.address === (activeWallet?.address ?? "")
                              )?.totalSquirts || completedCount}
                            </span>
                          </div>
                          <button
                            onClick={disconnectHandcash}
                            className={`w-full px-4 py-2 ${t.buttonAlt} rounded-xl transition-colors flex items-center justify-center gap-2 text-sm hover:opacity-80`}
                            title="Disconnect HandCash"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Username Input */}
              {(activeWallet || handcashAccount) && (
                <div className="mt-4">
                  <div className="flex items-center gap-3 mb-2">
                    <label className="text-sm font-medium">
                      Squirter Name (optional)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isPromo"
                        checked={isPromo}
                        onChange={(e) => setIsPromo(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="isPromo" className="text-sm font-medium">
                        Promotional Message
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={
                      isPromo
                        ? "Enter your promotional message"
                        : "Enter your squirter name"
                    }
                    className={`w-full px-4 py-2 ${
                      theme === "accessibility"
                        ? "bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-slate-900 placeholder-slate-400"
                        : t.cardDark
                    } rounded-xl focus:outline-none focus:ring-2 ${t.border}`}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Recipients section */}
          <div
            className={`${t.card} rounded-2xl p-6 sm:p-8 ${t.border} border shadow-xl`}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-semibold">Recipients</h2>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={recipientCount}
                  onChange={(e) =>
                    setRecipientCount(
                      Math.min(1000, Math.max(1, parseInt(e.target.value) || 1))
                    )
                  }
                  disabled={!activeWallet}
                  className={`w-24 sm:w-28 ${
                    theme === "accessibility"
                      ? "bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-slate-900 placeholder-slate-400"
                      : t.bg + " " + t.border
                  } border rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-center text-lg transition-colors duration-200`}
                />
              </div>
            </div>

            {recipients.length > 0 && (
              <div className="space-y-3">
                <div className={`text-base ${t.textMuted} mb-3`}>
                  Ready to squirt: {recipients.length} satoshis
                </div>
                <div className="max-h-56 sm:max-h-72 overflow-y-auto space-y-3">
                  {recipients.map((recipient, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between ${t.cardDark} p-3 sm:p-4 rounded-xl`}
                    >
                      <code className="text-sm sm:text-base font-mono truncate mr-3">
                        {recipient.address}
                      </code>
                      <span className="text-base font-semibold whitespace-nowrap">
                        {recipient.amount} sat
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Leaderboard component after Recipients section */}
          <Leaderboard theme={t} />

          {/* Send button */}
          <button
            onClick={handleSendTransactions}
            disabled={!activeWallet || recipients.length === 0 || isProcessing}
            className={`w-full py-4 sm:py-5 rounded-2xl text-lg font-semibold flex items-center justify-center space-x-3 shadow-xl mb-10
              ${
                !activeWallet || recipients.length === 0 || isProcessing
                  ? t.buttonAlt + " cursor-not-allowed"
                  : t.button +
                    " cursor-default hover:cursor-pointer active:cursor-pointer"
              } transition-all duration-300`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-6 h-6 animate-spin" />
                <span>Squirting...</span>
              </>
            ) : (
              <span>
                Squirt {recipientCount} Sat{recipientCount > 1 ? "s" : ""} 💦
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 py-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className={`${t.textMuted} text-sm font-medium`}>
            Brought to you by Bitcoin Spectrum Vision
          </p>
          <p className={`${t.textMuted} text-xs font-medium mt-1`}>
            an S Cartel company
          </p>
        </div>
      </footer>

      {/* Transaction queue overlay */}
      {transactions.length > 0 && showQueue && (
        <div
          className={`fixed bottom-6 right-4 sm:right-6 w-[calc(100%-2rem)] sm:w-[28rem] ${t.glass} rounded-2xl ${t.border} border shadow-xl overflow-hidden z-50`}
        >
          <div
            className={`p-4 sm:p-5 ${t.cardDark} border-b ${t.border} flex justify-between items-center`}
          >
            <div>
              <h3 className="text-lg font-semibold">Transaction Queue</h3>
              <div className="relative w-36 h-2 bg-gray-200/20 rounded-full mt-3 overflow-hidden">
                <div
                  className={`absolute top-0 left-0 h-full bg-gradient-to-r ${t.progress} transition-all duration-500`}
                  style={{
                    width: `${(completedCount / transactions.length) * 100}%`,
                  }}
                />
              </div>
              <p className={`text-base ${t.textMuted} mt-2`}>
                {completedCount}/{transactions.length} Transaction
                {transactions.length !== 1 ? "s" : ""} Completed
              </p>
            </div>
            <div className="flex items-center gap-3">
              {completedCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className={`px-3 py-1.5 ${t.buttonAlt} rounded-lg transition-colors text-sm cursor-default hover:cursor-pointer active:cursor-pointer`}
                >
                  Clear Done
                </button>
              )}
              <button
                onClick={() => setShowQueue(false)}
                className={`p-2 ${t.buttonAlt} rounded-lg transition-colors cursor-default hover:cursor-pointer active:cursor-pointer`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="max-h-[280px] sm:max-h-[280px] overflow-y-auto">
            {[...transactions]
              .sort((a, b) => {
                // Show pending/processing transactions at the top
                const isActiveA =
                  a.status === "pending" || a.status === "processing";
                const isActiveB =
                  b.status === "pending" || b.status === "processing";

                if (isActiveA && isActiveB) {
                  // If both are active, show newest first
                  return (
                    new Date(b.timestamp ?? 0).getTime() -
                    new Date(a.timestamp ?? 0).getTime()
                  );
                }

                if (isActiveA) return -1; // Show active before completed/failed
                if (isActiveB) return 1;

                // For completed/failed, show newest first
                return (
                  new Date(b.timestamp ?? 0).getTime() -
                  new Date(a.timestamp ?? 0).getTime()
                );
              })
              .map((tx, index) => (
                <div
                  key={tx.id}
                  className={`p-4 border-b ${
                    t.border
                  } flex items-center justify-between
                    ${index >= 4 ? "animate-fade-in" : ""}
                    ${tx.status === "completed" ? "animate-complete" : ""}
                    ${tx.status === "failed" ? "animate-fail" : ""}
                    transform transition-all duration-500 ease-in-out
                    ${
                      tx.status === "completed" || tx.status === "failed"
                        ? "hover:-translate-y-1"
                        : ""
                    }
                    relative
                  `}
                >
                  {/* Status indicator overlay */}
                  {(tx.status === "completed" || tx.status === "failed") && (
                    <div
                      className={`absolute inset-0 ${
                        tx.status === "completed"
                          ? "bg-green-500"
                          : "bg-red-500"
                      } opacity-0 animate-status-flash pointer-events-none`}
                    />
                  )}

                  <div className="flex-1 mr-4 relative z-10">
                    <div className="font-mono text-sm sm:text-base truncate">
                      {tx.status === "completed" && tx.txid ? (
                        <a
                          href={`https://whatsonchain.com/tx/${tx.txid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${t.accent} hover:opacity-80 transition-opacity`}
                          title="View on WhatsOnChain"
                        >
                          {tx.recipients[0]?.address || "No address"}
                        </a>
                      ) : (
                        tx.recipients[0]?.address || "No address"
                      )}
                    </div>
                    <div className={`text-sm sm:text-base ${t.textMuted}`}>
                      {tx.recipients[0]?.amount ?? 0}{" "}
                      {(tx.recipients[0]?.amount ?? 0) === 1 ? "sat" : "sats"}
                    </div>
                  </div>
                  <div className="flex items-center relative z-10">
                    {tx.status === "pending" && (
                      <div className="relative">
                        <RefreshCw className="w-5 h-5 animate-spin text-yellow-500" />
                        <div className="absolute inset-0 bg-yellow-500 opacity-20 animate-pulse rounded-full" />
                      </div>
                    )}
                    {tx.status === "processing" && (
                      <div className="relative">
                        <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                        <div className="absolute inset-0 bg-blue-500 opacity-20 animate-pulse rounded-full" />
                      </div>
                    )}
                    {tx.status === "completed" && (
                      <div className="relative">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                        <div className="absolute inset-0 bg-green-500 opacity-20 animate-success-pulse rounded-full" />
                      </div>
                    )}
                    {tx.status === "failed" && (
                      <div className="relative">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        <div className="absolute inset-0 bg-red-500 opacity-20 animate-fail-pulse rounded-full" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Minimized transaction queue button */}
      {transactions.length > 0 && !showQueue && (
        <button
          onClick={() => setShowQueue(true)}
          className={`fixed bottom-6 right-4 sm:right-6 ${t.button} transition-colors p-3 sm:p-4 rounded-full shadow-xl flex items-center gap-3 z-50 cursor-default hover:cursor-pointer active:cursor-pointer`}
        >
          <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="text-lg font-semibold">
            {completedCount}/{transactions.length}
          </span>
        </button>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileImport}
        accept=".txt"
        style={{ display: "none" }}
      />
    </div>
  );
}

export default App;

// Theme definitions
export interface ThemeConfig {
  bg: string;
  card: string;
  cardDark: string;
  accent: string;
  button: string;
  buttonAlt: string;
  text: string;
  textMuted: string;
  border: string;
  icon: string;
  progress: string;
  glass: string;
  logo: string;
}

const themes: Record<Theme, ThemeConfig> = {
  aqua: {
    bg: "bg-[#0a0b1e]",
    card: "bg-[#12132d]/80 backdrop-blur-md",
    cardDark: "bg-[#1a1b36]/90",
    accent: "from-cyan-400 via-teal-400 to-blue-500",
    button:
      "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700",
    buttonAlt: "bg-gray-700/60 backdrop-blur-sm hover:bg-gray-600/60",
    text: "text-white",
    textMuted: "text-gray-400",
    border: "border-gray-800/50",
    icon: "text-cyan-400",
    progress: "from-cyan-500 via-teal-500 to-blue-500",
    glass: "bg-[#12132d]/60 backdrop-blur-md",
    logo: "/images/aqua_and_accessiblity_theme_logo.png",
  },
  rainbow: {
    // Base colors with enhanced vibrancy
    bg: "bg-gradient-to-br from-red-500 via-yellow-500 via-green-500 via-blue-500 to-violet-500",
    card: "bg-white/15 backdrop-blur-md border border-white/30",
    cardDark: "bg-black/25 backdrop-blur-lg border border-white/30",

    // Text colors with better contrast
    text: "text-white drop-shadow-sm",
    textMuted: "text-white/90 drop-shadow-sm",

    // Interactive elements with enhanced states
    button:
      "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 hover:from-fuchsia-500 hover:via-violet-500 hover:to-indigo-500 active:from-fuchsia-700 active:via-violet-700 active:to-indigo-700 text-white shadow-lg hover:shadow-xl focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500 cursor-pointer transition-all duration-200 font-semibold",
    buttonAlt:
      "bg-white/20 backdrop-blur-sm hover:bg-white/30 active:bg-white/40 text-white border border-white/30 hover:border-white/40 shadow-lg hover:shadow-xl focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/20 cursor-pointer transition-all duration-200 font-semibold",

    // Accents and highlights with improved visibility
    accent: "from-fuchsia-400 via-violet-400 to-indigo-400",
    icon: "text-white hover:text-white/80 drop-shadow-sm cursor-pointer transition-colors duration-200",
    progress: "from-fuchsia-500 via-violet-500 to-indigo-500",

    // Containers and overlays
    border: "border-white/30 hover:border-white/40",
    glass: "bg-white/15 backdrop-blur-md border border-white/30 shadow-lg",

    // Logo
    logo: "/images/rainbowtheme_logo.png",
  },
  accessibility: {
    // Base colors - keeping the blue/white theme
    bg: "bg-blue-50",
    card: "bg-white shadow-md",
    cardDark: "bg-blue-50/90",

    // Text colors - ensuring WCAG contrast ratios
    text: "text-blue-950", // Dark blue for main text (11.5:1 contrast ratio)
    textMuted: "text-blue-800", // Slightly lighter but still very readable (8:1 contrast ratio)

    // Interactive elements with clear states
    button:
      "bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:bg-blue-200 disabled:text-blue-400 disabled:cursor-not-allowed cursor-pointer hover:cursor-pointer active:cursor-pointer transition-colors duration-200 font-semibold",
    buttonAlt:
      "bg-white hover:bg-blue-50 active:bg-blue-100 text-blue-800 border border-blue-200 hover:border-blue-300 focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:bg-blue-50 disabled:text-blue-300 disabled:border-blue-100 disabled:cursor-not-allowed cursor-pointer hover:cursor-pointer active:cursor-pointer transition-colors duration-200 font-semibold",

    // Accents and highlights - maintaining brand while ensuring visibility
    accent: "text-blue-900", // Darker blue for better contrast and readability
    icon: "text-blue-700 hover:text-blue-800 cursor-pointer",
    progress: "bg-blue-600", // Solid color for better visibility

    // Borders and containers - subtle but visible
    border: "border-blue-200 hover:border-blue-300 focus:border-blue-400",
    glass: "bg-white shadow-md border border-blue-100",

    // Logo
    logo: "/images/aqua_and_accessiblity_theme_logo.png",
  },
} as const;
