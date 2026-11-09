import { Plus, Pencil, Trash2, Loader2, Star, UserCheck, UserX, Crown, Search, KeyRound, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchDriversByRestaurant,
  createDriver,
  updateDriver,
  deleteDriver,
  fetchDriverStats,
} from "@/services/deliveryDriverService";
import { updateRestaurantConfig } from "@/services/restaurantConfigService";
import { useAuth } from "@/contexts/useAuth";
import AdminLayout from "@/layouts/AdminLayout";
import { useState, useEffect } from "react";
import { safeToast } from "@/lib/safeToast";
import { supabase } from "@/integrations/supabase/client";

// ── Driver form ──────────────────────────────────────────
interface DriverFormProps {
  initial?: { driver_code: string; full_name: string; phone: string };
  onSubmit: (data: { driver_code: string; full_name: string; phone?: string }) => void;
  onCancel: () => void;
}

const DriverForm = ({ initial, onSubmit, onCancel }: DriverFormProps) => {
  const [code, setCode] = useState(initial?.driver_code || "");
  const [name, setName] = useState(initial?.full_name || "");
  const [phone, setPhone] = useState(initial?.phone || "");

  const handleSubmit = () => {
    if (!name.trim()) return;
    const driverCode = code.trim() || `LIV-${String(Date.now()).slice(-4)}`;
    onSubmit({ driver_code: driverCode, full_name: name.trim(), phone: phone.trim() || undefined });
  };

  return (
    <div className="space-y-2 rounded-xl border bg-card p-4 shadow-card">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom complet"
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code livreur (auto si vide)"
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Téléphone (optionnel)"
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary">
          Annuler
        </button>
        <button onClick={handleSubmit} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Enregistrer
        </button>
      </div>
    </div>
  );
};

// ── Rating stars ─────────────────────────────────────────
const RatingStars = ({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((s) => (
      <button key={s} onClick={() => onChange(s)} className="p-0.5">
        <Star
          className={`h-4 w-4 transition-colors ${
            (value ?? 0) >= s ? "fill-warning text-warning" : "text-muted-foreground/30"
          }`}
        />
      </button>
    ))}
  </div>
);

// ── Stats badge ──────────────────────────────────────────
const DriverStatsBadge = ({ driverId }: { driverId: string }) => {
  const { data } = useQuery({
    queryKey: ["driver-stats", driverId],
    queryFn: () => fetchDriverStats(driverId),
  });
  if (!data) return null;
  return (
    <span className="text-[11px] text-muted-foreground">
      {data.delivered} livraison{data.delivered !== 1 ? "s" : ""}
    </span>
  );
};

// ── Main ─────────────────────────────────────────────────
const DriversManager = () => {
  const { restaurantId } = useAuth();
  const queryClient = useQueryClient();

  const [newMode, setNewMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["drivers", restaurantId],
    queryFn: () => fetchDriversByRestaurant(restaurantId!),
    enabled: !!restaurantId,
  });

  // Fetch restaurant config to get default_driver_id
  const { data: restoConfig } = useQuery({
    queryKey: ["restaurant-config", restaurantId],
    queryFn: async () => {
      const { data } = await (await import("@/integrations/supabase/client")).supabase
        .from("restaurants").select("default_driver_id").eq("id", restaurantId!).single();
      return data;
    },
    enabled: !!restaurantId,
  });

  const defaultDriverId = restoConfig?.default_driver_id;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["drivers", restaurantId] });
    queryClient.invalidateQueries({ queryKey: ["restaurant-config", restaurantId] });
  };

  const createMut = useMutation({
    mutationFn: (d: Parameters<typeof createDriver>[1]) => createDriver(restaurantId!, d),
    onSuccess: () => { invalidate(); setNewMode(false); safeToast.success("Livreur ajouté"); },
    onError: (error) => safeToast.error(error.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateDriver>[1] }) =>
      updateDriver(id, updates),
    onSuccess: () => { invalidate(); setEditingId(null); safeToast.success("Livreur mis à jour"); },
    onError: (error) => safeToast.error(error.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteDriver,
    onSuccess: () => { invalidate(); safeToast.success("Livreur supprimé"); },
    onError: (error) => safeToast.error(error.message),
  });

  // Filter and search
  const filteredDrivers = (drivers || []).filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || d.full_name.toLowerCase().includes(q) || d.driver_code.toLowerCase().includes(q) || (d.phone || "").includes(q);
    const matchStatus = filterStatus === "all" || (filterStatus === "active" ? d.is_active : !d.is_active);
    return matchSearch && matchStatus;
  });

  return (
    <AdminLayout>
      <div className="animate-fade-in px-4 pt-4 pb-20">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-foreground">Livreurs</h1>
          <button
            onClick={() => setNewMode(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>

        {/* Search + filter */}
        <div className="mb-4 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par nom, code ou téléphone…"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-1.5">
            {([
              { value: "all" as const, label: `Tous (${drivers?.length ?? 0})` },
              { value: "active" as const, label: `Actifs (${drivers?.filter(d => d.is_active).length ?? 0})` },
              { value: "inactive" as const, label: `Inactifs (${drivers?.filter(d => !d.is_active).length ?? 0})` },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                  filterStatus === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:border-primary/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {newMode && (
          <div className="mb-4">
            <DriverForm
              onSubmit={(d) => createMut.mutate(d)}
              onCancel={() => setNewMode(false)}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !filteredDrivers || filteredDrivers.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {searchQuery || filterStatus !== "all"
              ? "Aucun livreur ne correspond à votre recherche."
              : "Aucun livreur enregistré. Ajoutez-en un pour commencer."}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDrivers.map((driver) => (
              <div key={driver.id} className="rounded-xl border bg-card p-4 shadow-card">
                {editingId === driver.id ? (
                  <DriverForm
                    initial={{
                      driver_code: driver.driver_code,
                      full_name: driver.full_name,
                      phone: driver.phone || "",
                    }}
                    onSubmit={(d) => updateMut.mutate({ id: driver.id, updates: d })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <Link to={`/admin/drivers/${driver.id}`} className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                            {driver.driver_code}
                          </span>
                          <h3 className="text-sm font-semibold text-card-foreground">
                            {driver.full_name}
                          </h3>
                          {defaultDriverId === driver.id && (
                            <Crown className="h-3.5 w-3.5 text-warning" />
                          )}
                        </div>
                        {driver.phone && (
                          <p className="mt-1 text-xs text-muted-foreground">{driver.phone}</p>
                        )}
                        <div className="mt-1.5 flex items-center gap-3">
                          <DriverStatsBadge driverId={driver.id} />
                          <span
                            className={`flex items-center gap-1 text-[11px] font-semibold ${
                              driver.is_active ? "text-success" : "text-muted-foreground"
                            }`}
                          >
                            {driver.is_active ? (
                              <><UserCheck className="h-3 w-3" /> Actif</>
                            ) : (
                              <><UserX className="h-3 w-3" /> Inactif</>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className={`rounded-full px-2 py-1 ${driver.can_deliver ? "bg-blue-100 text-blue-800" : "bg-muted text-muted-foreground"}`}>Livreur {driver.can_deliver ? "activé" : "désactivé"}</span>
                          <span className={`rounded-full px-2 py-1 ${driver.can_serve ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>Serveur {driver.can_serve ? "activé" : "désactivé"}</span>
                        </div>
                      </Link>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const newDefault = defaultDriverId === driver.id ? null : driver.id;
                            updateRestaurantConfig(restaurantId!, { default_driver_id: newDefault })
                              .then(() => { invalidate(); safeToast.success(newDefault ? "Livreur par défaut défini" : "Livreur par défaut retiré"); })
                              .catch(() => safeToast.error("Erreur"));
                          }}
                          title={defaultDriverId === driver.id ? "Retirer par défaut" : "Définir par défaut"}
                          className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                            defaultDriverId === driver.id
                              ? "bg-warning/10 text-warning"
                              : "bg-muted text-muted-foreground hover:bg-warning/10 hover:text-warning"
                          }`}
                        >
                          <Crown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            updateMut.mutate({
                              id: driver.id,
                              updates: { is_active: !driver.is_active },
                            })
                          }
                          className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                            driver.is_active
                              ? "bg-destructive/10 text-destructive"
                              : "bg-success/10 text-success"
                          }`}
                        >
                          {driver.is_active ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          onClick={() => setEditingId(driver.id)}
                          className="text-muted-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Supprimer ce livreur ?")) deleteMut.mutate(driver.id);
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Internal rating */}
                    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                      <button onClick={() => updateMut.mutate({ id: driver.id, updates: { can_deliver: !driver.can_deliver } })} className="rounded-lg border px-3 py-2 text-xs font-semibold">{driver.can_deliver ? "Désactiver livreur" : "Activer livreur"}</button>
                      <button onClick={() => updateMut.mutate({ id: driver.id, updates: { can_serve: !driver.can_serve } })} className="rounded-lg border px-3 py-2 text-xs font-semibold">{driver.can_serve ? "Désactiver serveur" : "Activer serveur"}</button>
                      {driver.email ? <button onClick={async () => { const { error } = await supabase.auth.resetPasswordForEmail(driver.email!, { redirectTo: `${window.location.origin}/reset-password` }); if (error) safeToast.error(error.message); else safeToast.success(`Lien de réinitialisation envoyé à ${driver.email}`); }} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"><KeyRound className="h-3.5 w-3.5"/> Réinitialiser le mot de passe</button> : <button onClick={async () => { const address = window.prompt("E-mail du compte personnel à inviter"); if (!address || !restaurantId) return; const { data, error } = await supabase.functions.invoke("staff-account-admin", { body: { action: "invite", restaurant_id: restaurantId, driver_id: driver.id, email: address } }); if (error || data?.error) safeToast.error(data?.error || error?.message || "Invitation impossible"); else { safeToast.success(`Invitation envoyée à ${address}`); invalidate(); } }} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Mail className="h-3.5 w-3.5"/> Créer l’accès e-mail</button>}
                    </div>
                    {/* Internal rating */}
                    <div className="mt-3 flex items-center justify-between border-t pt-2">
                      <span className="text-[11px] text-muted-foreground">Note interne</span>
                      <RatingStars
                        value={driver.internal_rating ? Number(driver.internal_rating) : null}
                        onChange={(v) =>
                          updateMut.mutate({ id: driver.id, updates: { internal_rating: v } })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default DriversManager;
