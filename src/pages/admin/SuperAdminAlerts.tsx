import { AlertTriangle, Bell, Check, CheckCheck, Clock, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAlerts, markAlertRead, markAllAlertsRead } from "@/services/alertService";
import { useAuth } from "@/contexts/useAuth";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

function readMetadata(value: unknown): { orderNumber?: string | number; expectedMinutes?: number; actualMinutes?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata = value as Record<string, unknown>;
  const numberOrString = (entry: unknown): entry is string | number => typeof entry === "string" || typeof entry === "number";
  const numeric = (entry: unknown): entry is number => typeof entry === "number" && Number.isFinite(entry);
  return {
    orderNumber: numberOrString(metadata.order_number) ? metadata.order_number : undefined,
    expectedMinutes: numeric(metadata.expected_minutes) ? metadata.expected_minutes : undefined,
    actualMinutes: numeric(metadata.actual_minutes) ? metadata.actual_minutes : undefined,
  };
}

// Minimal layout for super admin (no bottom nav needed)
const SuperAdminAlerts = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [filterUnread, setFilterUnread] = useState(false);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["admin-alerts", filterUnread],
    queryFn: () => fetchAlerts(filterUnread),
  });

  // Realtime subscription for new alerts
  useEffect(() => {
    const channel = supabase
      .channel("admin-alerts-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_alerts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const markReadMut = useMutation({
    mutationFn: markAlertRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-alerts"] }),
  });

  const markAllMut = useMutation({
    mutationFn: markAllAlertsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-alerts"] }),
  });

  const unreadCount = alerts?.filter((alert) => !alert.is_read).length ?? 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-lg">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-primary">RZ</span>
            <span className="text-lg font-bold text-foreground">Super Admin</span>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-destructive px-2.5 py-0.5 text-[11px] font-bold text-destructive-foreground">
                <Bell className="h-3 w-3" />
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-foreground">
            Alertes
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterUnread(!filterUnread)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                filterUnread
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground"
              }`}
            >
              Non lues
            </button>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout lu
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <Bell className="mb-3 h-10 w-10" />
            <p className="text-sm">Aucune alerte</p>
            <p className="mt-1 text-xs">Le système surveille les restaurants automatiquement</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const meta = readMetadata(alert.metadata);
              return (
                <div
                  key={alert.id}
                  className={`rounded-xl border p-4 shadow-card transition-colors ${
                    alert.is_read ? "bg-card" : "bg-destructive/5 border-destructive/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          alert.is_read ? "text-muted-foreground" : "text-destructive"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-semibold text-card-foreground">
                          {alert.message}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {alert.restaurants?.name ?? "Restaurant inconnu"} —
                          Commande #{meta.orderNumber ? String(meta.orderNumber).padStart(3, "0") : "?"}
                        </p>
                        {meta.expectedMinutes && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Estimé : <span className="font-semibold text-foreground">{meta.expectedMinutes} min</span>
                            {" · "}
                            Réel : <span className="font-semibold text-destructive">{meta.actualMinutes} min</span>
                          </p>
                        )}
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(alert.created_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    {!alert.is_read && (
                      <button
                        onClick={() => markReadMut.mutate(alert.id)}
                        className="shrink-0 rounded-lg bg-card px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground border"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default SuperAdminAlerts;
