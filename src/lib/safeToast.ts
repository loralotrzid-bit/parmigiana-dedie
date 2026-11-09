/**
 * Centralised toast wrapper — single source of truth for all user notifications.
 * Throttles error toasts to prevent spam on flaky networks.
 * SSR / React Native safe.
 */
import { toast } from "sonner";

const isBrowser = typeof window !== "undefined";

let lastErrorTime = 0;

export const safeToast = {
  error(message: string, opts?: { description?: string }) {
    if (!isBrowser) return;
    const now = Date.now();
    if (now - lastErrorTime < 2000) return;
    lastErrorTime = now;
    toast.error(message, opts);
  },

  success(message: string, opts?: { description?: string }) {
    if (!isBrowser) return;
    toast.success(message, opts);
  },

  info(message: string, opts?: { description?: string; icon?: string }) {
    if (!isBrowser) return;
    toast(message, opts);
  },
};

/** @deprecated Use safeToast.error instead */
export const safeToastError = safeToast.error.bind(safeToast);
