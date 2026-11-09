import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Tag, Percent, DollarSign, Truck, ToggleLeft, ToggleRight } from "lucide-react";
import { fetchPromoCodes, createPromoCode, deletePromoCode, togglePromoCode, type PromoCode } from "@/services/promoCodeService";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeToast } from "@/lib/safeToast";

const DISCOUNT_TYPES = [
  { value: "percentage", label: "Pourcentage", icon: Percent },
  { value: "fixed", label: "Montant fixe", icon: DollarSign },
  { value: "free_delivery", label: "Livraison gratuite", icon: Truck },
];

const PromoCodeManager = ({ restaurantId }: { restaurantId: string }) => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<PromoCode["discount_type"]>("percentage");
  const [discountValue, setDiscountValue] = useState(10);
  const [minOrder, setMinOrder] = useState(0);
  const [maxUses, setMaxUses] = useState<number | "">("");
  const [expiresAt, setExpiresAt] = useState("");

  const { data: promos } = useQuery({
    queryKey: ["promo-codes", restaurantId],
    queryFn: () => fetchPromoCodes(restaurantId),
    enabled: !!restaurantId,
  });

  const createMut = useMutation({
    mutationFn: () => createPromoCode(restaurantId, code, discountType, discountValue, {
      minOrderAmount: minOrder,
      maxUses: maxUses ? Number(maxUses) : undefined,
      expiresAt: expiresAt || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      setShowForm(false);
      setCode(""); setDiscountValue(10); setMinOrder(0); setMaxUses(""); setExpiresAt("");
      safeToast.success("Code promo créé");
    },
    onError: (error) => safeToast.error(error.message),
  });

  const deleteMut = useMutation({
    mutationFn: deletePromoCode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      safeToast.success("Code supprimé");
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => togglePromoCode(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promo-codes"] }),
  });

  const discountLabel = (p: PromoCode) => {
    if (p.discount_type === "percentage") return `${p.discount_value}%`;
    if (p.discount_type === "fixed") return `${p.discount_value.toFixed(2)} €`;
    return "Livraison gratuite";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" /> Codes promo
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-3 w-3" /> Nouveau
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <div>
            <Label className="text-xs font-semibold">Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="EX: BIENVENUE10" className="mt-1 uppercase" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-2 block">Type de réduction</Label>
            <div className="flex gap-2">
              {DISCOUNT_TYPES.map((dt) => (
                <button
                  key={dt.value}
                  onClick={() => setDiscountType(dt.value as PromoCode["discount_type"])}
                  className={`flex-1 rounded-lg border p-2 text-center text-xs font-semibold ${
                    discountType === dt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  <dt.icon className="h-4 w-4 mx-auto mb-1" />
                  {dt.label}
                </button>
              ))}
            </div>
          </div>
          {discountType !== "free_delivery" && (
            <div>
              <Label className="text-xs font-semibold">
                Valeur {discountType === "percentage" ? "(%)" : "(€)"}
              </Label>
              <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} className="mt-1" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Min. commande (€)</Label>
              <Input type="number" value={minOrder} onChange={(e) => setMinOrder(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Utilisations max</Label>
              <Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : "")} placeholder="Illimité" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Date d'expiration</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border py-2 text-xs font-semibold text-foreground">Annuler</button>
            <button
              onClick={() => createMut.mutate()}
              disabled={!code || createMut.isPending}
              className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              Créer
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {(promos || []).map((p) => (
          <div key={p.id} className={`rounded-xl border p-3 ${p.is_active ? "bg-card" : "bg-muted/30 opacity-60"}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-mono font-bold text-primary">{p.code}</span>
                <span className="ml-2 text-xs font-semibold text-foreground">{discountLabel(p)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}>
                  {p.is_active ? <ToggleRight className="h-5 w-5 text-success" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                </button>
                <button onClick={() => deleteMut.mutate(p.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
              <span>{p.current_uses}{p.max_uses ? `/${p.max_uses}` : ""} utilisations</span>
              {p.min_order_amount > 0 && <span>Min: {p.min_order_amount}€</span>}
              {p.expires_at && <span>Expire: {new Date(p.expires_at).toLocaleDateString("fr-FR")}</span>}
            </div>
          </div>
        ))}
        {(!promos || promos.length === 0) && (
          <p className="text-center text-xs text-muted-foreground py-4">Aucun code promo</p>
        )}
      </div>
    </div>
  );
};

export default PromoCodeManager;
