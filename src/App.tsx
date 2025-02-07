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
import "./App.css";

function App() {
  // Theme state
  const [theme, setTheme] = useState<Theme>("aqua");
  const [showThemeSelector, setShowThemeSelector] = useState(false);

  // BSV SDK hooks
  const {
    wallet,
    generateWallet,
    importWallet,
    exportWallet,
    error: walletError,
  } = useWalletGeneration();

  const { balance } = useWalletBalance(wallet?.address || null);
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
  const [_showImportInput, setShowImportInput] = useState(false);
  const [_importKey, setImportKey] = useState("");
  const [showQueue, setShowQueue] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayBalance, setDisplayBalance] = useState(0);
  const previousBalance = useRef(0);

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
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error("Failed to copy address:", error);
    }
  };

  useEffect(() => {
    handleGenerateRecipients();
  }, [recipientCount]);

  const handleGenerateRecipients = () => {
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

  const handleCreateWallet = async () => {
    setIsGenerating(true);
    try {
      await generateWallet();
    } catch (error) {
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
        setShowImportInput(false);
        setImportKey("");
      }
    } catch (error) {
      console.error("Failed to import wallet:", error);
    } finally {
      setIsGenerating(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const handleSendTransactions = async () => {
    if (!wallet || recipients.length === 0) return;

    // Prevent double-clicking
    if (isProcessing) return;

    // Calculate total amount needed (including estimated fees)
    const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0);

    // Check if we have enough balance (rough estimate, actual fee will be calculated per tx)
    if (balance < totalAmount) {
      console.error("Insufficient balance for transactions");
      return;
    }

    setIsProcessing(true);
    try {
      // Add to queue and immediately process
      const newTransaction = addToQueue(recipients);
      await processTransaction(newTransaction);

      // Reset recipients after successful processing
      setRecipients([]);
      setRecipientCount(1);
      handleGenerateRecipients(); // Generate new recipients for next round
    } catch (error) {
      console.error("Failed to process transactions:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Rest of the UI code from the sample, but using our SDK variables
  return (
    <div
      className={`min-h-screen flex flex-col ${t.bg} ${t.text} p-2 sm:p-4 transition-colors duration-300 relative overflow-hidden`}
    >
      {/* Theme accessibility background */}
      {theme === "accessibility" && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none select-none">
          <div className="absolute -right-20 top-1/4 text-[400px] opacity-[0.15] transform -rotate-12 text-blue-600">
            ♿
          </div>
          <div className="absolute -left-20 bottom-1/4 text-[350px] opacity-[0.15] transform rotate-12 text-blue-600">
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
            className={`p-2.5 sm:p-3.5 rounded-full ${t.button} transition-colors shadow-lg`}
          >
            <Palette className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          {showThemeSelector && (
            <div
              className={`absolute right-0 mt-3 ${t.glass} rounded-lg shadow-lg p-3 ${t.border} border w-52`}
            >
              <button
                onClick={() => setTheme("aqua")}
                className="w-full text-left px-4 py-2.5 rounded hover:bg-black/10 transition-colors"
              >
                🌊 Aqua Theme
              </button>
              <button
                onClick={() => setTheme("rainbow")}
                className="w-full text-left px-4 py-2.5 rounded hover:bg-black/10 transition-colors"
              >
                🌈 Rainbow Theme
              </button>
              <button
                onClick={() => setTheme("accessibility")}
                className="w-full text-left px-4 py-2.5 rounded hover:bg-black/10 transition-colors"
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
                    Spreading the wealth, one satoshi at a time.
                  </p>
                  <p
                    className={`${t.textMuted} text-lg sm:text-xl leading-relaxed`}
                  >
                    Splashing Sats lets you distribute Bitcoin SV across the
                    network, creating tiny treasure troves that might change
                    someone's life in the future.
                  </p>
                  <p
                    className={`${t.textMuted} text-lg sm:text-xl leading-relaxed`}
                  >
                    Every satoshi we splash today could be tomorrow's
                    life-changing discovery. Join us in our mission to spread
                    opportunity and value across the blockchain.
                  </p>
                </div>

                {wallet && (
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
                      Total Sats Splashed
                    </span>
                    <div className={`h-5 w-px ${t.border} opacity-30`}></div>
                    <span
                      className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${t.accent} text-transparent bg-clip-text`}
                    >
                      {completedCount}
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
            {!wallet ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                  <button
                    onClick={handleCreateWallet}
                    disabled={isGenerating}
                    className={`flex-1 py-4 rounded-xl ${t.button} transition-colors flex items-center justify-center gap-3 disabled:opacity-50`}
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
                    className={`flex-1 py-4 rounded-xl ${t.buttonAlt} transition-colors flex items-center justify-center gap-3 disabled:opacity-50`}
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-lg">Import Wallet</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileImport}
                    accept=".txt"
                    style={{ display: "none" }}
                  />
                </div>
                {walletError && (
                  <p className="text-red-500 text-base mt-3">{walletError}</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className={`${t.bg} p-6 rounded-xl`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-semibold text-gray-400">
                        Current Balance:
                      </span>
                      <span className="text-2xl font-semibold transition-all duration-300">
                        {displayBalance} satoshis
                      </span>
                    </div>
                    <button
                      onClick={exportWallet}
                      className={`px-4 py-2 ${t.buttonAlt} rounded-xl transition-colors flex items-center gap-2`}
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
                      {wallet.address}
                    </code>
                    <button
                      onClick={handleCopyWalletAddress}
                      className={`p-3 ${t.buttonAlt} rounded-xl transition-colors flex-shrink-0`}
                    >
                      {copySuccess ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                  className={`w-24 sm:w-28 ${t.bg} ${t.border} border rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-center text-lg`}
                />
              </div>
            </div>

            {recipients.length > 0 && (
              <div className="space-y-3">
                <div className={`text-base ${t.textMuted} mb-3`}>
                  Ready to splash: {recipients.length} satoshis
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

          {/* Send button */}
          <button
            onClick={handleSendTransactions}
            disabled={!wallet || recipients.length === 0 || isProcessing}
            className={`w-full py-4 sm:py-5 rounded-2xl text-lg font-semibold flex items-center justify-center space-x-3 shadow-xl mb-10
              ${
                !wallet || recipients.length === 0 || isProcessing
                  ? t.buttonAlt + " cursor-not-allowed"
                  : t.button
              } transition-all duration-300`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-6 h-6 animate-spin" />
                <span>Splashing...</span>
              </>
            ) : (
              <span>
                Splash {recipientCount} Sat{recipientCount > 1 ? "s" : ""} 💦
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
                  className={`px-3 py-1.5 ${t.buttonAlt} rounded-lg transition-colors text-sm`}
                >
                  Clear Done
                </button>
              )}
              <button
                onClick={() => setShowQueue(false)}
                className={`p-2 ${t.buttonAlt} rounded-lg transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="max-h-72 sm:max-h-[32rem] overflow-y-auto">
            {transactions.map((tx, index) => (
              <div
                key={index}
                className={`p-4 border-b ${t.border} flex items-center justify-between`}
              >
                <div className="flex-1 mr-4">
                  <div className="font-mono text-sm sm:text-base truncate">
                    {tx.recipients[0]?.address || "No address"}
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
          className={`fixed bottom-6 right-4 sm:right-6 ${t.button} transition-colors p-3 sm:p-4 rounded-full shadow-xl flex items-center gap-3 z-50`}
        >
          <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="text-lg font-semibold">
            {completedCount}/{transactions.length}
          </span>
        </button>
      )}
    </div>
  );
}

export default App;

// Theme definitions
interface ThemeConfig {
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
    bg: "bg-gradient-to-br from-red-500 via-yellow-500 via-green-500 via-blue-500 to-violet-500",
    card: "bg-white/10 backdrop-blur-md",
    cardDark: "bg-white/20 backdrop-blur-lg",
    accent:
      "from-red-500 via-yellow-500 via-green-500 via-blue-500 to-violet-500",
    button:
      "bg-gradient-to-r from-red-500 via-purple-500 to-violet-500 hover:from-red-600 hover:via-purple-600 hover:to-violet-600",
    buttonAlt: "bg-white/20 backdrop-blur-sm hover:bg-white/30",
    text: "text-white",
    textMuted: "text-white/70",
    border: "border-white/20",
    icon: "text-white",
    progress:
      "from-red-500 via-yellow-500 via-green-500 via-blue-500 to-violet-500",
    glass: "bg-white/10 backdrop-blur-md",
    logo: "/images/rainbowtheme_logo.png",
  },
  accessibility: {
    bg: "bg-blue-100",
    card: "bg-white/90 backdrop-blur-md",
    cardDark: "bg-blue-100/90 backdrop-blur-lg",
    accent: "from-blue-700 to-blue-900",
    button: "bg-blue-600 hover:bg-blue-700 text-white",
    buttonAlt: "bg-blue-200/80 backdrop-blur-sm hover:bg-blue-300/80",
    text: "text-blue-900",
    textMuted: "text-blue-700",
    border: "border-blue-200",
    icon: "text-blue-600",
    progress: "from-blue-500 to-blue-600",
    glass: "bg-white/80 backdrop-blur-md",
    logo: "/images/aqua_and_accessiblity_theme_logo.png",
  },
} as const;
