import { supabase } from "@/integrations/supabase/client";
import { safeSupabaseCall } from "@/lib/safeSupabaseCall";

export interface LoyaltyProgress {
  user_id: string;
  hidden_score: number;
  reward_available: boolean;
  reward_claimed: boolean;
}

const REWARD_THRESHOLD = 100;

export async function fetchLoyaltyProgress(userId: string): Promise<LoyaltyProgress | null> {
  return safeSupabaseCall<LoyaltyProgress>(
    "loyalty/fetchProgress",
    () => supabase.from("loyalty_progress").select("*").eq("user_id", userId).maybeSingle()
  );
}

export async function incrementLoyaltyScore(userId: string): Promise<void> {
  // Awards stay paused until the server-side reward flow is enabled.
  void userId;
}

export async function claimReward(userId: string): Promise<boolean> {
  // Client requests cannot claim rewards while the feature is paused.
  void userId;
  return false;
}

export function getLoyaltyMessage(progress: LoyaltyProgress | null): {
  message: string;
  type: "reward" | "progress" | "start";
} {
  if (!progress) return { message: "Commandez pour débloquer des surprises ! 🎁", type: "start" };
  if (progress.reward_available) {
    return { message: "🎉 Récompense débloquée ! Produit offert sur votre prochaine commande.", type: "reward" };
  }
  const pct = Math.min(100, Math.round((progress.hidden_score / REWARD_THRESHOLD) * 100));
  if (pct > 70) return { message: "Vous y êtes presque ! 🔥 Encore quelques commandes…", type: "progress" };
  if (pct > 40) return { message: "Une surprise se prépare pour vous 🎁", type: "progress" };
  return { message: "Encore quelques commandes pour débloquer une récompense.", type: "progress" };
}
