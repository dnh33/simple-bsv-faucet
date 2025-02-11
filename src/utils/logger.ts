/**
 * Logger utility that only shows logs in development environment
 */
const isProduction = window.location.hostname === "www.push-the-button.app";

// Feature flags for logging
export const LogConfig = {
  HANDCASH: {
    enabled: false, // Set to false to disable HandCash logs
    level: "error", // 'error' | 'warn' | 'info' | 'debug'
  },
};

// Helper to check if HandCash logging is enabled for a specific level
const isHandCashLogEnabled = (level: string): boolean => {
  if (!LogConfig.HANDCASH.enabled) return false;

  const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  return (
    levels[level as keyof typeof levels] <=
    levels[LogConfig.HANDCASH.level as keyof typeof levels]
  );
};

// Original logger implementation
const baseLogger = {
  log: (...args: any[]) => !isProduction && console.log(...args),
  info: (...args: any[]) => !isProduction && console.info(...args),
  warn: (...args: any[]) => !isProduction && console.warn(...args),
  error: (...args: any[]) => !isProduction && console.error(...args),
  debug: (...args: any[]) => !isProduction && console.debug(...args),
};

// Enhanced logger with feature flags
export const logger = {
  log: (...args: any[]) => {
    if (args[0]?.toString().includes("HandCash")) {
      if (isHandCashLogEnabled("info")) {
        baseLogger.log(...args);
      }
      return;
    }
    baseLogger.log(...args);
  },
  info: (...args: any[]) => {
    // Check if it's a HandCash log
    if (
      args[0]?.toString().includes("🔄 HandCash") ||
      args[0]?.toString().includes("🔑 HandCash") ||
      args[0]?.toString().includes("✅ HandCash")
    ) {
      if (isHandCashLogEnabled("info")) {
        baseLogger.info(...args);
      }
      return;
    }
    baseLogger.info(...args);
  },
  warn: (...args: any[]) => {
    if (args[0]?.toString().includes("HandCash")) {
      if (isHandCashLogEnabled("warn")) {
        baseLogger.warn(...args);
      }
      return;
    }
    baseLogger.warn(...args);
  },
  error: (...args: any[]) => {
    if (args[0]?.toString().includes("HandCash")) {
      if (isHandCashLogEnabled("error")) {
        baseLogger.error(...args);
      }
      return;
    }
    baseLogger.error(...args);
  },
  debug: (...args: any[]) => {
    if (args[0]?.toString().includes("HandCash")) {
      if (isHandCashLogEnabled("debug")) {
        baseLogger.debug(...args);
      }
      return;
    }
    baseLogger.debug(...args);
  },
};
