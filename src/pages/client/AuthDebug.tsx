import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSession } from "@/lib/authSession";
import ClientLayout from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw } from "lucide-react";

interface LogEntry {
  time: string;
  type: "info" | "warn" | "error" | "event";
  message: string;
}

const fmt = () => new Date().toLocaleTimeString("fr-FR", { hour12: false });

const AuthDebug = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sessionInfo, setSessionInfo] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev.slice(-200), { time: fmt(), type, message }]);
  }, []);

  const refreshSession = useCallback(async () => {
    addLog("info", "── Checking session (single resolver) ──");
    try {
      const session = await getCurrentSession({ allowStorageFallback: true, allowRefresh: true });

      if (!session) {
        addLog("warn", "No session found");
        setSessionInfo({ status: "❌ No session" });
        return;
      }

      const user = session.user;
      const expiresAt = session.expires_at ?? 0;
      const nowSecs = Math.floor(Date.now() / 1000);
      const ttl = expiresAt - nowSecs;

      const info: Record<string, string> = {
        status: "✅ Active",
        email: user.email ?? "n/a",
        provider: user.app_metadata?.provider ?? "unknown",
        user_id: user.id,
        is_anonymous: String(user.is_anonymous ?? false),
        token_expires_at: new Date(expiresAt * 1000).toLocaleString("fr-FR"),
        token_ttl: ttl > 0 ? `${Math.floor(ttl / 60)}m ${ttl % 60}s` : "EXPIRED",
        created_at: user.created_at ?? "n/a",
        last_sign_in: user.last_sign_in_at ?? "n/a",
      };

      setSessionInfo(info);
      addLog("info", `User: ${user.email} | Provider: ${info.provider}`);
      addLog(ttl > 0 ? "info" : "error", `Token TTL: ${info.token_ttl}`);

      if (ttl <= 0) {
        addLog("error", "⚠️ TOKEN EXPIRED — this causes re-login requests!");
      } else if (ttl < 120) {
        addLog("warn", "Token expiring soon (<2min)");
      }
    } catch (error: unknown) {
      addLog("error", `Exception: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [addLog]);

  const forceRefresh = async () => {
    addLog("info", "── Force refreshing token ──");
    const { data: { session }, error } = await supabase.auth.refreshSession();
    if (error) {
      addLog("error", `refreshSession error: ${error.message}`);
    } else if (session) {
      addLog("info", `Token refreshed! New TTL: ${((session.expires_at ?? 0) - Math.floor(Date.now() / 1000))}s`);
      await refreshSession();
    } else {
      addLog("warn", "refreshSession returned null");
    }
  };

  const copyLogs = () => {
    const text = [
      `=== Auth Debug Report ===`,
      `Date: ${new Date().toISOString()}`,
      `UA: ${navigator.userAgent}`,
      ``,
      `── Session Info ──`,
      ...Object.entries(sessionInfo).map(([k, v]) => `${k}: ${v}`),
      ``,
      `── Event Log ──`,
      ...logs.map((l) => `[${l.time}] ${l.type.toUpperCase()}: ${l.message}`),
    ].join("\n");
    navigator.clipboard.writeText(text);
    addLog("info", "📋 Report copied to clipboard");
  };

  useEffect(() => {
    addLog("info", "Debug page mounted — listening for auth events");
    void refreshSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      addLog("event", `AUTH EVENT: ${event}`);
      if (session) {
        const ttl = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000);
        addLog("info", `  → user: ${session.user.email} | ttl: ${ttl}s`);
      } else {
        addLog("warn", "  → no session in event");
      }
      void refreshSession();
    });

    const interval = setInterval(() => {
      void refreshSession();
    }, 30_000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [addLog, refreshSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const colorMap = { info: "text-foreground", warn: "text-yellow-500", error: "text-destructive", event: "text-primary" };

  return (
    <ClientLayout>
      <div className="max-w-2xl mx-auto p-4 space-y-4 animate-fade-in">
        <h1 className="text-lg font-bold">🔍 Debug Auth Session</h1>

        <div className="rounded-lg border bg-card p-4 space-y-1 text-sm font-mono">
          {Object.entries(sessionInfo).length === 0 ? (
            <p className="text-muted-foreground">Chargement…</p>
          ) : (
            Object.entries(sessionInfo).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-muted-foreground min-w-[140px]">{k}:</span>
                <span className={v.startsWith("❌") || v === "EXPIRED" ? "text-destructive font-bold" : ""}>{v}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={refreshSession}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh Check
          </Button>
          <Button size="sm" variant="outline" onClick={forceRefresh}>
            🔄 Force Token Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={copyLogs}>
            <Copy className="h-4 w-4 mr-1" /> Copier le rapport
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 max-h-[50vh] overflow-y-auto text-xs font-mono space-y-0.5">
          {logs.map((l, i) => (
            <div key={i} className={colorMap[l.type]}>
              <span className="text-muted-foreground">[{l.time}]</span> {l.message}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <p className="text-xs text-muted-foreground">
          Laisse cette page ouverte et utilise l'app normalement. Les événements s'affichent en temps réel.
          Clique "Copier le rapport" et envoie-le moi pour debug.
        </p>
      </div>
    </ClientLayout>
  );
};

export default AuthDebug;
