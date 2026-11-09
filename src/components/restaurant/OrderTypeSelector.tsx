import { MapPin, Bike, ShoppingBag, UtensilsCrossed } from "lucide-react";
import DeliveryAddressInput from "@/components/client/DeliveryAddressInput";
import ScheduleOrderPicker from "@/components/client/ScheduleOrderPicker";
import { useCart } from "@/contexts/useCart";

const ORDER_TYPE_CONFIG: Record<string, { label: string; icon: typeof Bike }> = {
  delivery: { label: "Livraison", icon: Bike },
  takeaway: { label: "À emporter", icon: ShoppingBag },
  dine_in: { label: "Sur place", icon: UtensilsCrossed },
};

interface Props {
  orderType: string;
  setOrderType: (t: string) => void;
  availableModes: Array<"delivery" | "takeaway" | "dine_in">;
  deliveryBlocked: boolean;
  clientAddress: { display_name: string; lat: number; lng: number } | null;
  onSelectAddress: (a: { display_name: string; lat: number; lng: number }) => void;
  onClearAddress: () => void;
  openingHours?: unknown;
  schedulingMode?: string;
  isRestaurantClosed?: boolean;
}

const OrderTypeSelector = ({
  orderType,
  setOrderType,
  availableModes,
  deliveryBlocked,
  clientAddress,
  onSelectAddress,
  onClearAddress,
  openingHours,
  schedulingMode = "all",
  isRestaurantClosed = false,
}: Props) => {
  const { scheduledAt, setScheduledAt } = useCart();

  // Only show modes that are available
  const visibleModes = availableModes.filter((m) => ORDER_TYPE_CONFIG[m]);

  return (
    <div className="border-b border-border px-5 pb-4">
      {/* Segmented pill control */}
      {visibleModes.length > 1 && (
        <div className="relative inline-flex items-center rounded-2xl bg-muted/60 p-1 backdrop-blur-sm border border-border/50">
          {visibleModes.map((value) => {
            const { label, icon: Icon } = ORDER_TYPE_CONFIG[value];
            const active = orderType === value;
            return (
              <button
                key={value}
                onClick={() => setOrderType(value)}
                className={`relative z-10 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
                  active
                    ? "bg-card text-foreground shadow-elevated"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon
                  className={`h-4 w-4 transition-colors duration-200 ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Delivery address */}
      {orderType === "delivery" && availableModes.includes("delivery") && (
        <div className="mt-3">
          <DeliveryAddressInput
            selected={clientAddress}
            onSelect={onSelectAddress}
            onClear={onClearAddress}
          />
          {clientAddress && deliveryBlocked && (
            <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <MapPin className="h-4 w-4" />
                Vous êtes trop éloigné pour la livraison.
              </p>
              <p className="text-xs text-muted-foreground">Choisissez un autre mode :</p>
              <div className="flex gap-2">
                {availableModes.includes("takeaway") && (
                  <button
                    onClick={() => setOrderType("takeaway")}
                    className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground"
                  >
                    <ShoppingBag className="inline h-3.5 w-3.5 mr-1" />
                    À emporter
                  </button>
                )}
                {availableModes.includes("dine_in") && (
                  <button
                    onClick={() => setOrderType("dine_in")}
                    className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-foreground hover:bg-accent"
                  >
                    <UtensilsCrossed className="inline h-3.5 w-3.5 mr-1" />
                    Sur place
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schedule order picker — hidden for dine_in */}
      <div className="mt-3">
        <ScheduleOrderPicker
          scheduledAt={scheduledAt}
          onScheduleChange={setScheduledAt}
          openingHours={openingHours}
          orderType={orderType}
          schedulingMode={schedulingMode}
          isRestaurantClosed={isRestaurantClosed}
        />
      </div>
    </div>
  );
};

export default OrderTypeSelector;
