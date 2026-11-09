import { supabase } from "@/integrations/supabase/client";

export interface PhoneDeliveryRate {
  id: string;
  restaurant_id: string;
  postcode: string;
  locality: string;
  fee: number;
  is_active: boolean;
}

export async function fetchPhoneDeliveryRates(restaurantId: string): Promise<PhoneDeliveryRate[]> {
  const { data, error } = await supabase.from("restaurant_delivery_postcode_rates")
    .select("id,restaurant_id,postcode,locality,fee,is_active")
    .eq("restaurant_id", restaurantId).order("postcode");
  if (error) throw new Error("Impossible de charger les tarifs par code postal.");
  return (data || []) as PhoneDeliveryRate[];
}

export async function savePhoneDeliveryRate(rate: Pick<PhoneDeliveryRate, "restaurant_id" | "postcode" | "locality" | "fee" | "is_active"> & { id?: string }) {
  if (!/^\d{4}$/.test(rate.postcode)) throw new Error("Le code postal doit contenir exactement 4 chiffres.");
  if (!Number.isFinite(rate.fee) || rate.fee < 0 || rate.fee > 100) throw new Error("Tarif invalide.");
  const { error } = await supabase.from("restaurant_delivery_postcode_rates").upsert({
    ...rate, postcode: rate.postcode, locality: rate.locality.trim(), fee: Math.round(rate.fee * 100) / 100,
  }, { onConflict: "restaurant_id,postcode" });
  if (error) throw new Error(error.code === "23505" ? "Ce code postal existe déjà." : "Impossible d’enregistrer ce tarif.");
}

export async function deletePhoneDeliveryRate(id: string) {
  const { error } = await supabase.from("restaurant_delivery_postcode_rates").delete().eq("id", id);
  if (error) throw new Error("Impossible de supprimer ce code postal.");
}

export async function fetchPhoneDeliveryFallbackFee(restaurantId: string): Promise<number> {
  const { data, error } = await supabase.from("restaurants").select("phone_delivery_fallback_fee").eq("id", restaurantId).single();
  if (error) throw new Error("Impossible de charger le tarif hors zone.");
  return Number(data.phone_delivery_fallback_fee ?? 15);
}

export async function savePhoneDeliveryFallbackFee(restaurantId: string, fee: number) {
  if (!Number.isFinite(fee) || fee < 0 || fee > 100) throw new Error("Tarif hors zone invalide.");
  const { error } = await supabase.from("restaurants").update({ phone_delivery_fallback_fee: Math.round(fee * 100) / 100 }).eq("id", restaurantId);
  if (error) throw new Error("Impossible d’enregistrer le tarif hors zone.");
}
