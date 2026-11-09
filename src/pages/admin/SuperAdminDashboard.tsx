import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import QRCodeLib from "qrcode";
import ReactMarkdown from "react-markdown";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, Check, CheckCheck, Clock, Loader2,
  Building2, QrCode, Download, Brain, Search, Settings, ChevronDown, ChevronUp,
  Users, Shield, ShieldOff, Trash2, Eye, ExternalLink, MessageSquare, MailOpen, UserX, Bug, Plus, LogIn,
  Stethoscope, FileText, Copy, Sparkles
} from "lucide-react";
import SqlConsoleDialog from "@/components/admin/SqlConsoleDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { fetchAlerts, markAlertRead, markAllAlertsRead } from "@/services/alertService";
import { fetchAuditLogs } from "@/services/auditService";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeToast } from "@/lib/safeToast";
import { isDebugEnabled, setDebugEnabled, getLogBuffer, clearLogBuffer, exportLogsAsText, onLogUpdate, type AuthLogEntry } from "@/lib/debugLog";
import type { Json } from "@/integrations/supabase/types";

function readAlertMetadata(value: Json | null): { orderNumber: string | number; expectedMinutes?: number; actualMinutes?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { orderNumber: "?" };
  return {
    orderNumber: typeof value.order_number === "string" || typeof value.order_number === "number" ? value.order_number : "?",
    expectedMinutes: typeof value.expected_minutes === "number" ? value.expected_minutes : undefined,
    actualMinutes: typeof value.actual_minutes === "number" ? value.actual_minutes : undefined,
  };
}

const SuperAdminDashboard = () => {
  const { user, impersonateRestaurant } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterUnread, setFilterUnread] = useState(false);
  const [selectedRestoId, setSelectedRestoId] = useState<string | null>(null);
  const [qrSlug, setQrSlug] = useState("");
  const [qrTableNum, setQrTableNum] = useState(1);
  const [showNewRestoForm, setShowNewRestoForm] = useState(false);
  const [newRestoName, setNewRestoName] = useState("");
  const [newRestoSlug, setNewRestoSlug] = useState("");
  const [showNewAdminForm, setShowNewAdminForm] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminRestoId, setNewAdminRestoId] = useState("");

  // Alerts
  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["admin-alerts", filterUnread],
    queryFn: () => fetchAlerts(filterUnread),
  });

  // Restaurants list
  const { data: restaurants } = useQuery({
    queryKey: ["all-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id, name, slug, is_paused, delivery_mode, max_delivery_radius_km").order("name");
      return data || [];
    },
  });

  // Audit logs
  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ["audit-logs", selectedRestoId],
    queryFn: () => fetchAuditLogs(selectedRestoId || undefined),
  });

  // ETA learning data
  const { data: etaData } = useQuery({
    queryKey: ["eta-learning-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("eta_learning")
        .select("*")
        .order("correction_margin", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Admin accounts
  const { data: adminAccounts, isLoading: adminsLoading } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("id, user_id, role, is_active")
        .in("role", ["restaurant_admin", "super_admin"]);
      if (!roles || roles.length === 0) return [];

      const userIds = [...new Set(roles.map((role) => role.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, restaurant_id")
        .in("user_id", userIds);

      return roles.map((role) => {
        const profile = profiles?.find((candidate) => candidate.user_id === role.user_id);
        const resto = restaurants?.find((restaurant) => restaurant.id === profile?.restaurant_id);
        return {
          ...role,
          display_name: profile?.display_name,
          restaurant_id: profile?.restaurant_id,
          restaurant_name: resto?.name,
          restaurant_slug: resto?.slug,
        };
      });
    },
    enabled: !!restaurants,
  });

  // Realtime alerts
  useEffect(() => {
    const channel = supabase
      .channel("admin-alerts-rt")
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

  // Override: toggle pause for any restaurant
  const togglePause = useMutation({
    mutationFn: async ({ restoId, paused }: { restoId: string; paused: boolean }) => {
      await supabase.from("restaurants").update({ is_paused: paused }).eq("id", restoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-restaurants"] });
      safeToast.success("Statut mis à jour");
    },
  });

  // Toggle admin access
  const toggleAdmin = useMutation({
    mutationFn: async ({ roleId, active }: { roleId: string; active: boolean }) => {
      await supabase.from("user_roles").update({ is_active: active }).eq("id", roleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      safeToast.success("Accès admin mis à jour");
    },
  });

  // Create new restaurant
  const createRestaurant = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const { data, error } = await supabase.from("restaurants").insert({ name, slug }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["all-restaurants"] });
      setNewRestoName("");
      setNewRestoSlug("");
      setShowNewRestoForm(false);
      safeToast.success(`Restaurant "${data.name}" créé !`);
    },
    onError: (err) => {
      safeToast.error(err.message || "Erreur lors de la création");
    },
  });

  const handleImpersonate = (restoId: string) => {
    impersonateRestaurant(restoId);
    navigate("/admin");
  };

  // Delete admin role
  const deleteAdmin = useMutation({
    mutationFn: async (roleId: string) => {
      await supabase.from("user_roles").delete().eq("id", roleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      safeToast.success("Rôle admin supprimé");
    },
  });

  // Delete restaurant (cascade via DB function)
  const deleteRestaurant = useMutation({
    mutationFn: async (restoId: string) => {
      const { error } = await supabase.rpc("delete_restaurant_cascade", { p_restaurant_id: restoId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      safeToast.success("Restaurant et admin associé supprimés");
    },
    onError: (err) => {
      safeToast.error(err.message || "Erreur lors de la suppression");
    },
  });

  // Create admin user via edge function
  const createAdminUser = useMutation({
    mutationFn: async ({ email, password, restaurant_id, display_name }: { email: string; password: string; restaurant_id: string; display_name: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: { email, password, restaurant_id, display_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminName("");
      setNewAdminRestoId("");
      setShowNewAdminForm(false);
      safeToast.success("Admin créé avec succès !");
    },
    onError: (err) => {
      safeToast.error(err.message || "Erreur lors de la création");
    },
  });

  const unreadCount = alerts?.filter((alert) => !alert.is_read).length ?? 0;

  const qrUrl = qrSlug
    ? `${window.location.origin}/restaurant/${qrSlug}?source=qr&table=${qrTableNum}`
    : "";

  const [superQrDataUrl, setSuperQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!qrUrl) { setSuperQrDataUrl(null); return; }
    QRCodeLib.toDataURL(qrUrl, { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
      .then(setSuperQrDataUrl)
      .catch(() => setSuperQrDataUrl(null));
  }, [qrUrl]);

  const downloadQr = () => {
    if (!superQrDataUrl) return;
    const link = document.createElement("a");
    link.href = superQrDataUrl;
    link.download = `qr-${qrSlug}-table-${qrTableNum}.png`;
    link.click();
  };

  const getRestoName = (id: string) => restaurants?.find((restaurant) => restaurant.id === id)?.name || id.slice(0, 8);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-lg">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-primary">RZ</span>
            <span className="text-lg font-bold text-foreground">Super Admin</span>
          </div>
          {unreadCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-destructive px-2.5 py-0.5 text-[11px] font-bold text-destructive-foreground">
              <Bell className="h-3 w-3" /> {unreadCount}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-8">
        <Tabs defaultValue="alerts">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="alerts" className="flex-1 gap-1 text-xs">
              <Bell className="h-3.5 w-3.5" /> Alertes
            </TabsTrigger>
            <TabsTrigger value="restaurants" className="flex-1 gap-1 text-xs">
              <Building2 className="h-3.5 w-3.5" /> Restos
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex-1 gap-1 text-xs">
              <Clock className="h-3.5 w-3.5" /> Audit
            </TabsTrigger>
            <TabsTrigger value="qr" className="flex-1 gap-1 text-xs">
              <QrCode className="h-3.5 w-3.5" /> QR
            </TabsTrigger>
            <TabsTrigger value="admins" className="flex-1 gap-1 text-xs">
              <Users className="h-3.5 w-3.5" /> Admins
            </TabsTrigger>
            <TabsTrigger value="eta" className="flex-1 gap-1 text-xs">
              <Brain className="h-3.5 w-3.5" /> IA
            </TabsTrigger>
            <TabsTrigger value="support" className="flex-1 gap-1 text-xs">
              <MessageSquare className="h-3.5 w-3.5" /> Support
            </TabsTrigger>
            <TabsTrigger value="gdpr" className="flex-1 gap-1 text-xs">
              <UserX className="h-3.5 w-3.5" /> RGPD
            </TabsTrigger>
            <TabsTrigger value="debug" className="flex-1 gap-1 text-xs">
              <Bug className="h-3.5 w-3.5" /> Debug
            </TabsTrigger>
          </TabsList>

          {/* ── ALERTS ── */}
          <TabsContent value="alerts">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">Alertes ({alerts?.length ?? 0})</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterUnread(!filterUnread)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                    filterUnread ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"
                  }`}
                >
                  Non lues
                </button>
                {unreadCount > 0 && (
                  <button onClick={() => markAllMut.mutate()} className="text-[11px] text-muted-foreground hover:text-foreground">
                    <CheckCheck className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {alertsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : !alerts || alerts.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Bell className="mb-3 h-10 w-10" />
                <p className="text-sm">Aucune alerte</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => {
                  const metadata = readAlertMetadata(alert.metadata);
                  return (
                  <div key={alert.id} className={`rounded-xl border p-3 ${alert.is_read ? "bg-card" : "bg-destructive/5 border-destructive/20"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${alert.is_read ? "text-muted-foreground" : "text-destructive"}`} />
                        <div>
                          <p className="text-sm font-semibold text-card-foreground">{alert.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {alert.restaurants?.name ?? "?"} — #{metadata.orderNumber}
                          </p>
                          {metadata.expectedMinutes !== undefined && (
                            <p className="text-xs text-muted-foreground">
                              Estimé: <span className="font-semibold text-foreground">{metadata.expectedMinutes}m</span>
                              {metadata.actualMinutes !== undefined && <>{" → "}Réel: <span className="font-semibold text-destructive">{metadata.actualMinutes}m</span></>}
                            </p>
                          )}
                        </div>
                      </div>
                      {!alert.is_read && (
                        <button onClick={() => markReadMut.mutate(alert.id)} className="shrink-0 rounded border px-1.5 py-1">
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── RESTAURANTS (Override) ── */}
          <TabsContent value="restaurants">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-foreground">Tous les restaurants</h2>
              <button
                onClick={() => setShowNewRestoForm(!showNewRestoForm)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau
              </button>
            </div>

            {showNewRestoForm && (
              <div className="rounded-xl border bg-card p-4 mb-4 space-y-3 shadow-card">
                <p className="text-sm font-bold text-foreground">Créer un restaurant</p>
                <div>
                  <Label className="text-xs font-semibold">Nom</Label>
                  <Input
                    value={newRestoName}
                    onChange={e => {
                      setNewRestoName(e.target.value);
                      setNewRestoSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
                    }}
                    placeholder="Ex: Pizza Roma"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Slug (URL)</Label>
                  <Input
                    value={newRestoSlug}
                    onChange={e => setNewRestoSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="pizza-roma"
                    className="mt-1 font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => createRestaurant.mutate({ name: newRestoName.trim(), slug: newRestoSlug.trim() })}
                    disabled={!newRestoName.trim() || !newRestoSlug.trim() || createRestaurant.isPending}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {createRestaurant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
                  </button>
                  <button
                    onClick={() => setShowNewRestoForm(false)}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {restaurants?.map((r) => (
                 <div key={r.id} className="rounded-xl border bg-card p-3 shadow-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">{r.name}</p>
                      <p className="text-xs font-mono text-primary">{r.slug}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.delivery_mode === "disabled" ? "Pas de livraison" : `Livraison: ${r.max_delivery_radius_km}km`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <SqlConsoleDialog restaurantId={r.id} restaurantName={r.name} />
                      <button
                        onClick={() => handleImpersonate(r.id)}
                        className="rounded-lg bg-primary/10 px-2 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                        title="Gérer ce restaurant"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                      </button>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        r.is_paused ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
                      }`}>
                        {r.is_paused ? "En pause" : "Actif"}
                      </span>
                       <button
                        onClick={() => togglePause.mutate({ restoId: r.id, paused: !r.is_paused })}
                        className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                          r.is_paused ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
                        }`}
                      >
                        {r.is_paused ? "Réactiver" : "Pause"}
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="rounded-lg bg-destructive/10 px-2 py-1.5 text-destructive hover:bg-destructive/20 transition-colors" title="Supprimer">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer « {r.name} » ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Cette action est irréversible. Le restaurant, son menu, ses commandes et l'admin associé seront définitivement supprimés.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteRestaurant.mutate(r.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Supprimer définitivement
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── AUDIT LOG ── */}
          <TabsContent value="audit">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">Journal d'audit</h2>
              <select
                value={selectedRestoId || ""}
                onChange={e => setSelectedRestoId(e.target.value || null)}
                className="rounded-lg border bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="">Tous les restos</option>
                {restaurants?.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {auditLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : !auditLogs || auditLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune activité enregistrée</p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-xl border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {log.action === "config_update" ? "⚙️ Config modifiée" :
                           log.action === "pause_orders" ? "⏸ Pause activée" :
                           log.action === "resume_orders" ? "▶️ Pause levée" : log.action}
                        </p>
                        <p className="text-xs text-muted-foreground">{getRestoName(log.restaurant_id)}</p>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── QR GENERATOR ── */}
          <TabsContent value="qr">
            <h2 className="text-base font-bold text-foreground mb-3">Générateur QR Code</h2>
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-semibold">Restaurant</Label>
                <select
                  value={qrSlug}
                  onChange={e => setQrSlug(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Sélectionner…</option>
                  {restaurants?.map((r) => (
                    <option key={r.id} value={r.slug}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Numéro de table</Label>
                <Input type="number" min={1} max={100} value={qrTableNum} onChange={e => setQrTableNum(Number(e.target.value))} className="mt-1" />
              </div>
              {qrUrl && (
                <div className="text-center space-y-3">
                  <div className="mx-auto w-48 h-48 rounded-xl border bg-card p-2 shadow-card">
                    {superQrDataUrl ? (
                      <img src={superQrDataUrl} alt="QR Code" className="w-full h-full" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Table {qrTableNum}</p>
                  <p className="text-[11px] text-muted-foreground break-all">{qrUrl}</p>
                  <button
                    onClick={downloadQr}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                  >
                    <Download className="h-4 w-4" /> Télécharger
                  </button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── ADMINS MANAGEMENT ── */}
          <TabsContent value="admins">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-foreground">Gestion des admins</h2>
              <button
                onClick={() => setShowNewAdminForm(!showNewAdminForm)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvel admin
              </button>
            </div>

            {showNewAdminForm && (
              <div className="rounded-xl border bg-card p-4 mb-4 space-y-3 shadow-card">
                <p className="text-sm font-bold text-foreground">Créer un compte admin</p>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={newAdminEmail}
                    onChange={e => setNewAdminEmail(e.target.value)}
                    placeholder="admin@restaurant.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Mot de passe</Label>
                  <Input
                    type="password"
                    value={newAdminPassword}
                    onChange={e => setNewAdminPassword(e.target.value)}
                    placeholder="12 caractères minimum"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Nom d'affichage</Label>
                  <Input
                    value={newAdminName}
                    onChange={e => setNewAdminName(e.target.value)}
                    placeholder="Nom de l'admin"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Restaurant</Label>
                  <select
                    value={newAdminRestoId}
                    onChange={e => setNewAdminRestoId(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">Sélectionner un restaurant…</option>
                    {restaurants?.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => createAdminUser.mutate({
                      email: newAdminEmail.trim(),
                      password: newAdminPassword,
                      restaurant_id: newAdminRestoId,
                      display_name: newAdminName.trim(),
                    })}
                    disabled={!newAdminEmail.trim() || newAdminPassword.length < 12 || !newAdminRestoId || createAdminUser.isPending}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {createAdminUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
                  </button>
                  <button
                    onClick={() => setShowNewAdminForm(false)}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
            {adminsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : !adminAccounts || adminAccounts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucun compte admin trouvé</p>
            ) : (
              <div className="space-y-2">
                {adminAccounts.map((acc) => (
                  <div key={acc.id} className={`rounded-xl border p-3 shadow-card ${acc.is_active ? "bg-card" : "bg-destructive/5 border-destructive/20"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-foreground truncate">
                            {acc.display_name || acc.user_id.slice(0, 8)}
                          </p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            acc.role === "super_admin"
                              ? "bg-primary/10 text-primary"
                              : "bg-accent text-accent-foreground"
                          }`}>
                            {acc.role === "super_admin" ? "Super Admin" : "Restaurant Admin"}
                          </span>
                        </div>
                        {acc.restaurant_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            🏪 {acc.restaurant_name} <span className="font-mono text-primary">({acc.restaurant_slug})</span>
                          </p>
                        )}
                        <p className={`text-[11px] mt-0.5 font-semibold ${acc.is_active ? "text-success" : "text-destructive"}`}>
                          {acc.is_active ? "✓ Actif" : "✗ Désactivé"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Impersonate as restaurant admin */}
                        {acc.restaurant_id && acc.role === "restaurant_admin" && (
                          <button
                            onClick={() => handleImpersonate(acc.restaurant_id)}
                            className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                            title="Accéder en tant qu'admin"
                          >
                            <LogIn className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* View restaurant */}
                        {acc.restaurant_slug && acc.role === "restaurant_admin" && (
                          <a
                            href={`/restaurant/${acc.restaurant_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Voir le restaurant"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {/* Toggle active — not for own account */}
                        {acc.user_id !== user?.id && (
                          <button
                            onClick={() => toggleAdmin.mutate({ roleId: acc.id, active: !acc.is_active })}
                            className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                              acc.is_active
                                ? "bg-warning/10 text-warning hover:bg-warning/20"
                                : "bg-success/10 text-success hover:bg-success/20"
                            }`}
                            title={acc.is_active ? "Désactiver l'accès" : "Réactiver l'accès"}
                          >
                            {acc.is_active ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {/* Delete role — not for own account or super_admin */}
                        {acc.user_id !== user?.id && acc.role !== "super_admin" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="rounded-lg bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 transition-colors"
                                title="Supprimer le rôle"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer ce rôle admin ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Cette action est irréversible. L'utilisateur perdra définitivement l'accès admin
                                  {acc.restaurant_name ? ` à ${acc.restaurant_name}` : ""}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteAdmin.mutate(acc.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ETA LEARNING + AI DIAGNOSTIC (IA) ── */}
          <TabsContent value="eta">
            <div className="space-y-6">
              {/* AI Site Diagnostic */}
              <AIDiagnosticPanel />

              {/* ETA Learning */}
              <div>
                <h2 className="text-base font-bold text-foreground mb-3">Apprentissage IA (ETA)</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Restaurants triés par marge de correction décroissante (les plus en retard en haut)
                </p>
                {!etaData || etaData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée d'apprentissage. Le cron s'exécute chaque semaine.</p>
                ) : (
                  <div className="space-y-2">
                    {etaData.map((row) => (
                      <div key={row.id} className="rounded-xl border bg-card p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{getRestoName(row.restaurant_id)}</p>
                            <p className="text-xs text-muted-foreground">
                              Semaine du {row.week_start} · {row.total_orders} commandes
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-lg font-extrabold ${Number(row.correction_margin) > 5 ? "text-destructive" : Number(row.correction_margin) > 0 ? "text-warning" : "text-success"}`}>
                              +{row.correction_margin} min
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Annoncé: {row.avg_announced_eta}m → Réel: {row.avg_real_duration}m
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── SUPPORT TICKETS ── */}
          <TabsContent value="support">
            <SupportTicketsPanel />
          </TabsContent>

          {/* ── GDPR DELETION REQUESTS ── */}
          <TabsContent value="gdpr">
            <DeletionRequestsPanel />
          </TabsContent>

          {/* ── DEBUG MODE ── */}
          <TabsContent value="debug">
            <DebugPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

/* ── AI Diagnostic Panel ── */
const AIDiagnosticPanel = () => {
  const { isSuperAdmin, session } = useAuth();
  const [report, setReport] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const runDiagnostic = async () => {
    if (!isSuperAdmin || !session?.access_token) {
      setError("Une session superadmin valide est nécessaire.");
      return;
    }
    setIsAnalyzing(true);
    setReport("");
    setError(null);

    const logs = getLogBuffer().slice(-100).map((l) => ({
      timestamp: l.timestamp,
      tag: l.tag,
      message: l.message,
      result: l.result,
    }));

    const authState = {
      isAuthenticated: true,
      role: "super_admin",
    };

    const browserInfo = {
      userAgent: navigator.userAgent.slice(0, 100),
      language: navigator.language,
      online: navigator.onLine,
      cookiesEnabled: navigator.cookieEnabled,
      localStorage: (() => { try { return typeof localStorage !== "undefined"; } catch { return false; } })(),
      path: window.location.pathname,
    };

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/site-diagnostic`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ logs, authState, browserInfo }),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Erreur inconnue" }));
        setError(errData.error || `Erreur ${resp.status}`);
        setIsAnalyzing(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { setError("Pas de stream"); setIsAnalyzing(false); return; }

      const decoder = new TextDecoder();
      let textBuffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              setReport(accumulated);
            }
          } catch { /* partial */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportReport = () => {
    if (!report) return;
    const now = new Date().toISOString().slice(0, 16).replace(":", "h");
    const header = `# Diagnostic RZFood — ${now}\n\n`;
    const blob = new Blob([header + report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnostic-rzfood-${now}.md`;
    a.click();
    URL.revokeObjectURL(url);
    safeToast.success("Rapport exporté !");
  };

  const copyPrompt = () => {
    const promptSection = report.match(/### 💡 Prompt de correction[\s\S]*$/);
    const text = promptSection ? promptSection[0].replace("### 💡 Prompt de correction", "").trim() : report;
    navigator.clipboard.writeText(text).then(() => safeToast.success("Prompt copié !"));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-foreground">Diagnostic IA du site</h2>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        L'IA analyse les logs, l'état de l'authentification et le navigateur pour détecter les dysfonctionnements.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={runDiagnostic}
          disabled={isAnalyzing}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isAnalyzing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Lancer le diagnostic</>
          )}
        </button>
        {report && (
          <>
            <button
              onClick={exportReport}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <FileText className="h-4 w-4" /> Exporter .md
            </button>
            <button
              onClick={copyPrompt}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Copy className="h-4 w-4" /> Copier prompt fix
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          ❌ {error}
        </div>
      )}

      {(report || isAnalyzing) && (
        <div
          ref={reportRef}
          className="rounded-xl border bg-card p-4 max-h-[600px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none"
        >
          {report ? (
            <ReactMarkdown>{report}</ReactMarkdown>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">L'IA analyse vos logs…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Debug Panel with Live Log Viewer ── */
const DebugPanel = () => {
  const { user, session, isLoading: authLoading } = useAuth();
  const [enabled, setEnabled2] = useState(isDebugEnabled());
  const [logs, setLogs] = useState<readonly AuthLogEntry[]>(getLogBuffer());
  const [filter, setFilter] = useState("");
  const logEndRef = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ behavior: "smooth" });
    }, []);

  useEffect(() => {
    const unsub = onLogUpdate(() => setLogs([...getLogBuffer()]));
    return unsub;
  }, []);

  const toggle = () => {
    const next = !enabled;
    setDebugEnabled(next);
    setEnabled2(next);
    safeToast.info(next ? "Mode debug activé" : "Mode debug désactivé");
  };

  const copyLogs = () => {
    const text = exportLogsAsText();
    navigator.clipboard.writeText(text).then(() => safeToast.success("Logs copiés !"));
  };

  const filteredLogs = filter
    ? logs.filter((l) => l.tag.includes(filter.toLowerCase()) || l.message.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const tagColor: Record<string, string> = {
    auth: "text-indigo-500",
    session: "text-teal-500",
    supabase: "text-blue-500",
    oauth: "text-pink-500",
    callback: "text-violet-500",
    error: "text-red-500",
    extension: "text-orange-500",
    cart: "text-amber-500",
    checkout: "text-emerald-500",
    redirect: "text-orange-400",
    profile: "text-purple-500",
  };

  const resultIcon = (r?: string) => r === "success" ? "✅" : r === "fail" ? "❌" : r === "info" ? "ℹ️" : "";

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-foreground">Auth Monitoring & Debug</h2>

      {/* Auth State Summary */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">État Auth Actuel</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Status:</span>{" "}
            <span className={`font-bold ${authLoading ? "text-amber-500" : user ? "text-emerald-500" : "text-red-500"}`}>
              {authLoading ? "⏳ Loading" : user ? "✅ Authenticated" : "❌ Not authenticated"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Email:</span>{" "}
            <span className="font-mono text-xs text-foreground">{user?.email ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">User ID:</span>{" "}
            <span className="font-mono text-xs text-foreground">{user?.id?.slice(0, 12) ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Token Expiry:</span>{" "}
            <span className="font-mono text-xs text-foreground">
              {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString("fr-FR") : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Toggle + Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={toggle}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            enabled ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
          }`}
        >
          {enabled ? "🔴 Désactiver" : "🟢 Activer"} Debug
        </button>
        <button onClick={copyLogs} className="rounded-xl border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
          📋 Copier Logs ({logs.length})
        </button>
        <button onClick={() => { clearLogBuffer(); setLogs([]); }} className="rounded-xl border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
          🗑 Effacer
        </button>
      </div>

      {/* Filter */}
      <Input
        placeholder="Filtrer par tag ou message... (auth, session, oauth, error, extension)"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="text-sm"
      />

      {/* Live Log Stream */}
      <div className="rounded-xl border bg-muted/30 max-h-[400px] overflow-y-auto font-mono text-[11px] leading-relaxed">
        {filteredLogs.length === 0 ? (
          <p className="p-4 text-center text-muted-foreground">Aucun log. Navigue dans l'app pour générer des logs.</p>
        ) : (
          <div className="p-2 space-y-0.5">
            {filteredLogs.map((entry) => (
              <div key={entry.id} className="flex gap-1.5 hover:bg-muted/50 rounded px-1 py-0.5">
                <span className="text-muted-foreground shrink-0">{entry.timestamp}</span>
                <span className={`font-bold shrink-0 ${tagColor[entry.tag] ?? "text-muted-foreground"}`}>
                  [{entry.tag.toUpperCase()}]
                </span>
                <span className="shrink-0">{resultIcon(entry.result)}</span>
                <span className="text-foreground">{entry.message}</span>
                {entry.data !== undefined && (
                  <span className="text-muted-foreground truncate max-w-[300px]" title={JSON.stringify(entry.data)}>
                    {JSON.stringify(entry.data)}
                  </span>
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Tag Legend */}
      {enabled && (
        <div className="rounded-xl border bg-muted/50 p-4 text-xs text-muted-foreground space-y-1">
          <p>📋 <strong>Tags disponibles :</strong></p>
          <p><span className="text-indigo-500 font-bold">[AUTH]</span> — Login, logout, session, rôles</p>
          <p><span className="text-teal-500 font-bold">[SESSION]</span> — Résolution session, cache, storage</p>
          <p><span className="text-blue-500 font-bold">[SUPABASE]</span> — getSession(), erreurs SDK</p>
          <p><span className="text-pink-500 font-bold">[OAUTH]</span> — Google/Apple redirect</p>
          <p><span className="text-violet-500 font-bold">[CALLBACK]</span> — Retour OAuth, hash parsing</p>
          <p><span className="text-red-500 font-bold">[ERROR]</span> — Toutes les erreurs capturées</p>
          <p><span className="text-orange-500 font-bold">[EXTENSION]</span> — Interférences extensions navigateur</p>
          <p><span className="text-amber-500 font-bold">[CART]</span> — Panier, articles</p>
          <p><span className="text-emerald-500 font-bold">[CHECKOUT]</span> — Tunnel de commande</p>
          <p><span className="text-purple-500 font-bold">[PROFILE]</span> — Profil utilisateur</p>
        </div>
      )}
    </div>
  );
};

/* ── Support Tickets Panel ── */
const SupportTicketsPanel = () => {
  const queryClient = useQueryClient();
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      safeToast.success("Ticket mis à jour");
    },
  });

  const deleteTicket = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("support_tickets").delete().eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      safeToast.success("Ticket supprimé");
    },
  });

  const statusLabel: Record<string, string> = { open: "Ouvert", in_progress: "En cours", closed: "Fermé" };
  const statusColor: Record<string, string> = { open: "bg-amber-100 text-amber-800", in_progress: "bg-blue-100 text-blue-800", closed: "bg-muted text-muted-foreground" };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!tickets || tickets.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <MailOpen className="mb-3 h-10 w-10" />
        <p className="text-sm">Aucun ticket de support</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-foreground">Tickets support ({tickets.length})</h2>
      {tickets.map((t) => (
        <div key={t.id} className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-card-foreground truncate">{t.subject}</p>
              <p className="text-xs text-muted-foreground">{t.email} — {new Date(t.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusColor[t.status] ?? statusColor.open}`}>
              {statusLabel[t.status] ?? t.status}
            </span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">{t.message}</p>
          <div className="flex items-center gap-2 pt-1">
            {t.status !== "in_progress" && (
              <button onClick={() => updateStatus.mutate({ id: t.id, status: "in_progress" })} className="rounded-lg bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-200 transition-colors">
                En cours
              </button>
            )}
            {t.status !== "closed" && (
              <button onClick={() => updateStatus.mutate({ id: t.id, status: "closed" })} className="rounded-lg bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted/80 transition-colors">
                Fermer
              </button>
            )}
            <a href={`mailto:${t.email}?subject=Re: ${encodeURIComponent(t.subject)}`} className="rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors">
              Répondre
            </a>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="ml-auto text-destructive/60 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer ce ticket ?</AlertDialogTitle>
                  <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteTicket.mutate(t.id)}>Supprimer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ))}
    </div>
  );
};


/* ── GDPR Deletion Requests Panel ── */
const DeletionRequestsPanel = () => {
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useQuery({
    queryKey: ["deletion-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("data_deletion_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const markProcessed = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("data_deletion_requests").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deletion-requests"] });
      safeToast.success("Demande marquée comme traitée");
    },
  });

  const statusLabel: Record<string, string> = { pending: "En attente", processed: "Traité" };
  const statusColor: Record<string, string> = { pending: "bg-amber-100 text-amber-800", processed: "bg-muted text-muted-foreground" };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!requests || requests.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <UserX className="mb-3 h-10 w-10" />
        <p className="text-sm">Aucune demande de suppression</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-foreground">Demandes de suppression ({requests.length})</h2>
      <p className="text-xs text-muted-foreground">Les données doivent être effacées sous 30 jours après la demande (RGPD).</p>
      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-card-foreground">{r.user_email}</p>
              <p className="text-xs text-muted-foreground">
                Demandé le {new Date(r.requested_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="text-xs text-muted-foreground">
                Deadline : {new Date(new Date(r.requested_at).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusColor[r.status] ?? statusColor.pending}`}>
              {statusLabel[r.status] ?? r.status}
            </span>
          </div>
          {r.status === "pending" && (
            <button
              onClick={() => markProcessed.mutate(r.id)}
              className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Marquer comme traité
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default SuperAdminDashboard;
