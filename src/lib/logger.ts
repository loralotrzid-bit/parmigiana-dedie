/**
 * Production-safe logger.
 * In production builds, debug/info logs are silenced.
 * Warnings and errors always emit (but without sensitive data).
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /** Debug-only: stripped in production */
  debug: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  /** Info-level: stripped in production */
  info: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  /** Warnings: always emitted (keep concise, no sensitive data) */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  /** Errors: always emitted */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
