import { Banknote, CreditCard, QrCode } from "lucide-react";

export type PaymentMethod = "cash" | "card_counter" | "card_delivery" | "wero" | "online";

interface PaymentMethodSelectorProps {
  orderType: string;
  selected: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
  acceptedPayments?: string[];
}

const ALL_METHODS: Record<string, { label: (orderType: string) => string; icon: typeof Banknote; description: (orderType: string) => string; forOrderTypes: string[] }> = {
  cash: {
    label: (ot) => ot === "delivery" ? "Cash à la livraison" : "Cash sur place",
    icon: Banknote,
    description: (ot) => ot === "delivery" ? "Payer en espèces au livreur" : "Payer en espèces au comptoir",
    forOrderTypes: ["dine_in", "takeaway", "delivery"],
  },
  card_delivery: {
    label: () => "Carte à la livraison",
    icon: CreditCard,
    description: () => "Payer par carte au livreur",
    forOrderTypes: ["delivery"],
  },
  card_counter: {
    label: () => "Carte au comptoir",
    icon: CreditCard,
    description: () => "Payer par carte au comptoir",
    forOrderTypes: ["dine_in", "takeaway"],
  },
  wero: {
    label: () => "Wero (QR code)",
    icon: QrCode,
    description: () => "Payer en avance par QR code",
    forOrderTypes: ["dine_in", "takeaway", "delivery"],
  },
};

const PaymentMethodSelector = ({ orderType, selected, onSelect, acceptedPayments }: PaymentMethodSelectorProps) => {
  const accepted = acceptedPayments && acceptedPayments.length > 0 ? acceptedPayments : Object.keys(ALL_METHODS);

  const methods = accepted
    .filter((key) => ALL_METHODS[key]?.forOrderTypes.includes(orderType))
    .map((key) => {
      const m = ALL_METHODS[key];
      return { key: key as PaymentMethod, label: m.label(orderType), icon: m.icon, description: m.description(orderType) };
    });

  if (methods.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-card-foreground">Mode de paiement</h3>
      <div className="space-y-2">
        {methods.map(({ key, label, icon: Icon, description }) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-transparent bg-secondary/50 hover:bg-secondary"
              }`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PaymentMethodSelector;
