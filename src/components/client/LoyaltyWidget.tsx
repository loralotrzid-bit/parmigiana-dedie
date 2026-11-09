import { useEffect, useState } from "react";
import { Gift, Sparkles } from "lucide-react";
import { fetchLoyaltyProgress, getLoyaltyMessage, type LoyaltyProgress } from "@/services/loyaltyService";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/useAuth";

const LoyaltyWidget = () => {
  const [progress, setProgress] = useState<LoyaltyProgress | null>(null);
  const { user, isLoading } = useAuth();
  const userId = user && !user.is_anonymous ? user.id : null;

  useEffect(() => {
    if (!userId) {
      setProgress(null);
      return;
    }
    fetchLoyaltyProgress(userId).then(setProgress).catch(() => setProgress(null));
  }, [userId]);

  if (isLoading || !userId) return null;

  const { message, type } = getLoyaltyMessage(progress);
  const pct = progress ? Math.min(100, Math.round((progress.hidden_score / 100) * 100)) : 0;

  return (
    <div className={`rounded-xl border p-4 shadow-card ${
      type === "reward" ? "bg-success/5 border-success/30" : "bg-card"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {type === "reward" ? (
          <Sparkles className="h-5 w-5 text-success" />
        ) : (
          <Gift className="h-5 w-5 text-primary" />
        )}
        <span className="text-sm font-bold text-foreground">
          {type === "reward" ? "Récompense !" : "Programme fidélité"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{message}</p>
      {type !== "reward" && (
        <Progress value={pct} className="h-2" />
      )}
    </div>
  );
};

export default LoyaltyWidget;
