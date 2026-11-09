import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { safeToast } from "@/lib/safeToast";
import {
  deletePhoneDeliveryRate, fetchPhoneDeliveryFallbackFee, fetchPhoneDeliveryRates,
  savePhoneDeliveryFallbackFee, savePhoneDeliveryRate, type PhoneDeliveryRate,
} from "@/services/phoneDeliveryRatesService";

export default function PhoneDeliveryRatesManager() {
  const { restaurantId } = useAuth();
  const qc = useQueryClient();
  const key = ["phone-delivery-rates", restaurantId];
  const rates = useQuery({ queryKey: key, queryFn: () => fetchPhoneDeliveryRates(restaurantId!), enabled: !!restaurantId });
  const fallback = useQuery({ queryKey: ["phone-delivery-fallback", restaurantId], queryFn: () => fetchPhoneDeliveryFallbackFee(restaurantId!), enabled: !!restaurantId });
  const [drafts, setDrafts] = useState<Record<string, { postcode: string; locality: string; fee: string; is_active: boolean }>>({});
  const [newRate, setNewRate] = useState({ postcode: "", locality: "", fee: "" });
  const [fallbackValue, setFallbackValue] = useState("15");

  useEffect(() => { if (fallback.data !== undefined) setFallbackValue(String(fallback.data)); }, [fallback.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const saveRate = useMutation({
    mutationFn: savePhoneDeliveryRate,
    onSuccess: () => { void refresh(); safeToast.success("Tarif enregistré"); },
    onError: (error: Error) => safeToast.error(error.message),
  });
  const removeRate = useMutation({
    mutationFn: deletePhoneDeliveryRate,
    onSuccess: () => { void refresh(); safeToast.success("Code postal supprimé"); },
    onError: (error: Error) => safeToast.error(error.message),
  });
  const saveFallback = useMutation({
    mutationFn: (fee: number) => savePhoneDeliveryFallbackFee(restaurantId!, fee),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["phone-delivery-fallback", restaurantId] }); safeToast.success("Tarif hors zone enregistré"); },
    onError: (error: Error) => safeToast.error(error.message),
  });

  const draftFor = (rate: PhoneDeliveryRate) => drafts[rate.id] || {
    postcode: rate.postcode, locality: rate.locality, fee: String(rate.fee), is_active: rate.is_active,
  };

  return <section className="space-y-4 rounded-xl border p-4">
    <div><h3 className="font-bold">Tarifs de livraison des commandes téléphoniques</h3><p className="mt-1 text-xs text-muted-foreground">Le code postal détermine le tarif. Les montants sont provisoires et modifiables ici.</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/40 p-3">
      <label className="text-xs">Tarif si code non répertorié (€)<input aria-label="Tarif hors zone" type="number" min="0" max="100" step="0.5" value={fallbackValue} onChange={e => setFallbackValue(e.target.value)} className="mt-1 block w-32 rounded-md border bg-background p-2 text-sm" /></label>
      <button disabled={saveFallback.isPending} onClick={() => saveFallback.mutate(Number(fallbackValue))} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save size={15} className="mr-1 inline"/>Enregistrer</button>
      <span className="text-xs text-muted-foreground">Tarif initial : 15 €</span>
    </div>
    {rates.isError && <p role="alert" className="text-sm text-destructive">{rates.error.message}</p>}
    <div className="space-y-2">{rates.data?.map(rate => {
      const draft = draftFor(rate);
      return <div key={rate.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[100px_1fr_110px_auto_auto] sm:items-end">
        <label className="text-xs">Code postal<input value={draft.postcode} maxLength={4} onChange={e => setDrafts(v => ({ ...v, [rate.id]: { ...draft, postcode: e.target.value.replace(/\D/g, "") } }))} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm" /></label>
        <label className="text-xs">Localité<input value={draft.locality} maxLength={80} onChange={e => setDrafts(v => ({ ...v, [rate.id]: { ...draft, locality: e.target.value } }))} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm" /></label>
        <label className="text-xs">Tarif (€)<input type="number" min="0" max="100" step="0.5" value={draft.fee} onChange={e => setDrafts(v => ({ ...v, [rate.id]: { ...draft, fee: e.target.value } }))} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm" /></label>
        <label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" checked={draft.is_active} onChange={e => setDrafts(v => ({ ...v, [rate.id]: { ...draft, is_active: e.target.checked } }))}/> Active</label>
        <div className="flex gap-2"><button aria-label={`Enregistrer ${rate.postcode}`} disabled={saveRate.isPending} onClick={() => saveRate.mutate({ id: rate.id, restaurant_id: rate.restaurant_id, ...draft, fee: Number(draft.fee) })} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-50"><Save size={16}/></button><button aria-label={`Supprimer ${rate.postcode}`} disabled={removeRate.isPending} onClick={() => removeRate.mutate(rate.id)} className="rounded-lg border p-2 text-destructive disabled:opacity-50"><Trash2 size={16}/></button></div>
      </div>;
    })}</div>
    <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[100px_1fr_110px_auto] sm:items-end">
      <label className="text-xs">Nouveau code<input placeholder="6000" value={newRate.postcode} maxLength={4} onChange={e => setNewRate(v => ({ ...v, postcode: e.target.value.replace(/\D/g, "") }))} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm" /></label>
      <label className="text-xs">Localité<input placeholder="Charleroi" value={newRate.locality} maxLength={80} onChange={e => setNewRate(v => ({ ...v, locality: e.target.value }))} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm" /></label>
      <label className="text-xs">Tarif (€)<input type="number" min="0" max="100" step="0.5" value={newRate.fee} onChange={e => setNewRate(v => ({ ...v, fee: e.target.value }))} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm" /></label>
      <button disabled={saveRate.isPending} onClick={() => {
        if (!restaurantId) return;
        saveRate.mutate({ restaurant_id: restaurantId, postcode: newRate.postcode, locality: newRate.locality, fee: Number(newRate.fee), is_active: true });
        setNewRate({ postcode: "", locality: "", fee: "" });
      }} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus size={16} className="mr-1 inline"/>Ajouter</button>
    </div>
    <p className="text-xs text-muted-foreground">Les dix codes de départ commencent par 6. Un code désactivé ou absent applique le tarif hors zone.</p>
  </section>;
}
