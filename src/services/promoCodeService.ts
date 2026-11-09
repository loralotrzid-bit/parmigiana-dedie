import { supabase } from "@/integrations/supabase/client";

export interface PromoCode {
  id: string;
  restaurant_id: string;
  code: string;
  discount_type: "percentage" | "fixed" | "free_delivery";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export async function fetchPromoCodes(restaurantId: string): Promise<PromoCode[]> {
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as PromoCode[];
}

export async function createPromoCode(
  restaurantId: string,
  code: string,
  discountType: PromoCode["discount_type"],
  discountValue: number,
  opts: { minOrderAmount?: number; maxUses?: number; expiresAt?: string } = {}
): Promise<void> {
  const { error } = await supabase.from("promo_codes").insert({
    restaurant_id: restaurantId,
    code: code.toUpperCase().trim(),
    discount_type: discountType,
    discount_value: discountValue,
    min_order_amount: opts.minOrderAmount || 0,
    max_uses: opts.maxUses || null,
    expires_at: opts.expiresAt || null,
  });
  if (error) throw error;
}

export async function deletePromoCode(id: string): Promise<void> {
  const { error } = await supabase.from("promo_codes").delete().eq("id", id);
  if (error) throw error;
}

export async function togglePromoCode(id: string, isActive: boolean): Promise<void> {
  await supabase.from("promo_codes").update({ is_active: isActive }).eq("id", id);
}
