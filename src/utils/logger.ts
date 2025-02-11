/**
 * Logger utility that only shows logs in development environment
 */
const isProduction =
  window.location.hostname === "www.squrtingsats.netlify.app";

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

type LogArgs = unknown[];

// Original logger implementation
const baseLogger = {
  log: (...args: LogArgs) => !isProduction && console.log(...args),
  info: (...args: LogArgs) => !isProduction && console.info(...args),
  warn: (...args: LogArgs) => !isProduction && console.warn(...args),
  error: (...args: LogArgs) => !isProduction && console.error(...args),
  debug: (...args: LogArgs) => !isProduction && console.debug(...args),
};

// Enhanced logger with feature flags
export const logger = {
  log: (...args: LogArgs) => {
    if (args[0]?.toString().includes("HandCash")) {
      if (isHandCashLogEnabled("info")) {
        baseLogger.log(...args);
      }
      return;
    }
    baseLogger.log(...args);
  },
  info: (...args: LogArgs) => {
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
  warn: (...args: LogArgs) => {
    if (args[0]?.toString().includes("HandCash")) {
      if (isHandCashLogEnabled("warn")) {
        baseLogger.warn(...args);
      }
      return;
    }
    baseLogger.warn(...args);
  },
  error: (...args: LogArgs) => {
    if (args[0]?.toString().includes("HandCash")) {
      if (isHandCashLogEnabled("error")) {
        baseLogger.error(...args);
      }
      return;
    }
    baseLogger.error(...args);
  },
  debug: (...args: LogArgs) => {
    if (args[0]?.toString().includes("HandCash")) {
      if (isHandCashLogEnabled("debug")) {
        baseLogger.debug(...args);
      }
      return;
    }
    baseLogger.debug(...args);
  },
};
