import { useState, useEffect } from "react";
import { Truck, TruckIcon, Clock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchDeliverySettings, toggleDeliveryPause } from "@/services/deliverySettingsService";
import { safeToast } from "@/lib/safeToast";

const DURATIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 heure", value: 60 },
  { label: "Manuel", value: 0 },
];

const DeliveryPauseControl = ({ restaurantId }: { restaurantId: string }) => {
  const queryClient = useQueryClient();
  const [showDurations, setShowDurations] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["delivery-settings", restaurantId],
    queryFn: () => fetchDeliverySettings(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  const isPaused = settings?.delivery_paused && (
    !settings.paused_until || new Date(settings.paused_until) > new Date()
  );

  const remainingMinutes = isPaused && settings?.paused_until
    ? Math.max(0, Math.round((new Date(settings.paused_until).getTime() - Date.now()) / 60000))
    : null;

  const mutation = useMutation({
    mutationFn: ({ paused, duration }: { paused: boolean; duration?: number }) =>
      toggleDeliveryPause(restaurantId, paused, duration),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-settings"] });
      setShowDurations(false);
      safeToast.success(isPaused ? "Livraison réactivée" : "Livraison mise en pause");
    },
  });

  if (isPaused) {
    return (
      <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-destructive" />
            <span className="text-sm font-bold text-destructive">Livraison OFF</span>
          </div>
          {remainingMinutes !== null && (
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Clock className="h-3 w-3" />
              {remainingMinutes} min restantes
            </span>
          )}
        </div>
        <button
          onClick={() => mutation.mutate({ paused: false })}
          disabled={mutation.isPending}
          className="w-full rounded-xl bg-success py-2.5 text-sm font-bold text-success-foreground disabled:opacity-60"
        >
          ✅ Réactiver la livraison
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-success" />
          <span className="text-sm font-bold text-success">Livraison ON</span>
        </div>
      </div>

      {showDurations ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Durée de la pause :</p>
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => mutation.mutate({ paused: true, duration: d.value || undefined })}
                disabled={mutation.isPending}
                className="rounded-lg border bg-destructive/5 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                {d.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowDurations(false)}
            className="w-full text-xs text-muted-foreground mt-1"
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowDurations(true)}
          className="w-full rounded-xl border-2 border-destructive/30 bg-destructive/5 py-2.5 text-sm font-bold text-destructive"
        >
          🚫 Désactiver la livraison
        </button>
      )}
    </div>
  );
};

export default DeliveryPauseControl;
