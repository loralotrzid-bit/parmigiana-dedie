import { createRoot } from "react-dom/client";
import "@/lib/oauthHashCapture";
import "@/lib/supabaseCallQueue";
import App from "./App.tsx";
import "./index.css";
import { dbg, detectExtensions } from "@/lib/debugLog";
import "@/lib/tabElection";
import "@/lib/supabaseSingletonGuard";

// ── Pre-auth boot logging ──
dbg("auth", "App boot started", {
  path: window.location.pathname,
  userAgent: navigator.userAgent.slice(0, 80),
  hasLocalStorage: (() => { try { return typeof localStorage !== "undefined"; } catch { return false; } })(),
  sbTokenPresent: (() => { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith("sb-") && k.endsWith("-auth-token")) return true; } return false; } catch { return false; } })(),
}, "info");

try { localStorage.removeItem("rzfood-auth"); } catch { /* Storage can be unavailable in private browsing. */ }

// ── Extension interference detection ──
const extensions = detectExtensions();
dbg("extension", "Extension scan", extensions, Object.values(extensions).some(Boolean) ? "info" : "success");

// ── Global error capture ──
// Web3/extension keywords that indicate non-app errors
const EXTENSION_KEYWORDS = [
  "Origin not allowed", "ethereum", "tron", "solana",
  "metamask", "phantom", "inpage.js", "contentscript",
  "web3", "wallet", "injectedScript",
];

function classifyError(value: unknown): { origin: string; isExtension: boolean } {
  const message = value instanceof Error ? value.message : String(value ?? "");
  const stack = value instanceof Error ? value.stack ?? "" : "";
  const combined = (message + " " + stack).toLowerCase();

  // Broad extension detection: keywords + extension protocol
  if (
    stack.includes("chrome-extension://") ||
    stack.includes("moz-extension://") ||
    EXTENSION_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()))
  ) {
    return { origin: "extension", isExtension: true };
  }
  if (message.includes("Navigator LockManager") || message.includes("auth-token")) {
    return { origin: "supabase-lock", isExtension: false };
  }
  if (message.includes("supabase") || stack.includes("supabase")) {
    return { origin: "supabase", isExtension: false };
  }
  return { origin: "unknown", isExtension: false };
}

window.addEventListener("unhandledrejection", (event) => {
  const { origin, isExtension } = classifyError(event.reason);
  if (isExtension) {
    dbg("extension", "EXTENSION INTERFERENCE — unhandledrejection", {
      message: event.reason instanceof Error ? event.reason.message : String(event.reason),
      origin,
    }, "info");
    event.preventDefault();
    return;
  }
  const msg = event.reason?.message || String(event.reason ?? "");
  const isSupabaseLock = origin === "supabase-lock" ||
    (msg.includes("LockManager") && msg.includes("timed out") && msg.includes("auth"));
  if (isSupabaseLock) {
    event.preventDefault();
    return;
  }
  dbg("error", "Unhandled promise rejection", {
    origin,
    message: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack?.split("\n").slice(0, 3).join("\n") : undefined,
  }, "fail");
});

window.addEventListener("error", (event) => {
  const { origin, isExtension } = classifyError(event.error ?? event.message);
  dbg(isExtension ? "extension" : "error", isExtension ? "EXTENSION INTERFERENCE — error" : "Uncaught error", {
    origin,
    message: event.message,
    filename: event.filename,
    line: event.lineno,
  }, isExtension ? "info" : "fail");
  if (isExtension) event.preventDefault();
});

// Boot React immediately — no async, no pre-processing
createRoot(document.getElementById("root")!).render(<App />);
