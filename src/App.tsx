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

function App() {
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

  // HandCash Connect hooks
  const {
    connect: connectHandcash,
    isConnecting: isConnectingHandcash,
    account: handcashAccount,
    disconnect: disconnectHandcash,
  } = useHandCashConnect();

  // HandCash Wallet hooks
  const { wallet: handcashWallet, sendTransaction: sendHandcashTransaction } =
    useHandCashWallet();

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
      console.error("Failed to copy address:", error);
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
        console.error("Failed to generate recipient addresses:", error);
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
      console.error("Failed to generate wallet:", error);
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
      console.error("Failed to import wallet:", error);
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
    const toastId = toast.loading("Processing transactions...");

    try {
      if (handcashWallet) {
        // Add HandCash transaction to queue for UI
        const tx = addToQueue(
          recipients,
          username.trim() || handcashAccount?.displayName,
          isPromo
        );

        // Send through HandCash
        const txid = await sendHandcashTransaction(recipients);

        // Update transaction status
        tx.status = "completed";
        tx.txid = txid;
      } else {
        // Create individual transaction for each recipient using BSV SDK
        for (const recipient of recipients) {
          const tx = addToQueue(
            [recipient],
            username.trim() || undefined,
            isPromo
          );
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

      toast.success("Transaction completed successfully", {
        id: toastId,
      });
    } catch (error) {
      toast.error("Failed to process transaction", {
        id: toastId,
      });
      console.error("Failed to process transaction:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Monitor HandCash store changes
  useEffect(() => {
    const unsubscribe = handcashStore.subscribe((state) => {
      logger.debug("HandCash store update", {
        hasAccount: !!state.account,
        connectionStatus: state.connectionStatus,
        hasAuthToken: !!state.authToken,
      });
    });
    return () => unsubscribe();
  }, []);

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
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-10 px-4 sm:px-6">
          {/* Header section */}
          <div className="p-8 sm:p-10">
            <div className="flex flex-col lg:flex-row gap-10">
              <div className="w-full lg:w-auto">
                <div className="relative w-fit">
                  <img
                    src={t.logo}
                    alt="Splashing Sats Logo"
                    className="h-28 sm:h-36 lg:h-44 w-auto object-contain"
                  />
                  {theme === "aqua" && (
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 mix-blend-overlay opacity-20 rounded-full filter blur-2xl scale-110 animate-pulse"></div>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-8">
                <div
                  className={`space-y-5 ${t.card} rounded-2xl p-8 ${t.border} border shadow-xl`}
                >
                  <p
                    className={`${t.textMuted} text-lg sm:text-xl leading-relaxed`}
                  >
                    Squirting satoshis, one at a time.
                  </p>
                  <p
                    className={`${t.textMuted} text-lg sm:text-xl leading-relaxed`}
                  >
                    Squirting Sats lets you distribute Bitcoin SV across the
                    network, creating tiny treasure troves that might change
                    someone's life in the future.
                  </p>
                  <p
                    className={`${t.textMuted} text-lg sm:text-xl leading-relaxed`}
                  >
                    Every satoshi we squirt today could be tomorrow's
                    life-changing discovery. Join us in our mission to spread
                    opportunity and value across the blockchain.
                  </p>
                </div>

                {activeWallet && (
                  <div
                    className={`inline-flex items-center gap-4 ${
                      t.cardDark
                    } py-3 px-6 rounded-xl ${
                      theme === "aqua" ? "bg-opacity-50" : ""
                    }`}
                  >
                    <span
                      className={`${t.textMuted} font-medium text-base sm:text-lg`}
                    >
                      Total Squirts
                    </span>
                    <div className={`h-5 w-px ${t.border} opacity-30`}></div>
                    <span
                      className={`text-2xl sm:text-3xl font-bold ${
                        theme === "accessibility"
                          ? "text-blue-900"
                          : `bg-gradient-to-r ${t.accent} text-transparent bg-clip-text`
                      }`}
                    >
                      {stats.find((s) => s.address === activeWallet.address)
                        ?.totalSquirts || completedCount}
                    </span>
                  </div>
                )}
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
                  {/* BSV SDK Wallet */}
                  {activeWallet && (
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
                    <div className={`${t.bg} p-6 rounded-xl mt-4`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={handcashAccount.avatarUrl}
                            alt={handcashAccount.displayName}
                            className="w-10 h-10 rounded-full"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-2xl font-semibold ${
                                  theme === "accessibility"
                                    ? "text-blue-900"
                                    : "text-white"
                                }`}
                              >
                                {handcashAccount.displayName}
                              </span>
                              <img
                                src="/images/handcash-icon.svg"
                                alt="HandCash"
                                className="w-5 h-5 opacity-90"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span
                                className={`${t.textMuted} text-sm font-mono`}
                              >
                                {handcashAccount.paymail}
                              </span>
                              <span className={`${t.textMuted} text-sm`}>
                                Balance:{" "}
                                {handcashAccount.balance?.toLocaleString() ||
                                  "0"}{" "}
                                satoshis
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={disconnectHandcash}
                          className={`px-4 py-2 ${t.buttonAlt} rounded-xl transition-colors flex items-center gap-2 cursor-default hover:cursor-pointer active:cursor-pointer`}
                          title="Disconnect HandCash"
                        >
                          <span>Disconnect</span>
                          <X className="w-5 h-5" />
                        </button>
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
                {completedCount}/{transactions.length} Completed
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
              .reverse() // Show newest first
              .map((tx, index) => (
                <div
                  key={tx.id}
                  className={`p-4 border-b ${
                    t.border
                  } flex items-center justify-between ${
                    index >= 4 ? "animate-fade-in" : ""
                  }`}
                >
                  <div className="flex-1 mr-4">
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
                  <div className="flex items-center">
                    {tx.status === "pending" && (
                      <RefreshCw className="w-5 h-5 animate-spin text-yellow-500" />
                    )}
                    {tx.status === "processing" && (
                      <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                    )}
                    {tx.status === "completed" && (
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                    )}
                    {tx.status === "failed" && (
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
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

type Theme = "aqua" | "rainbow" | "accessibility";

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
