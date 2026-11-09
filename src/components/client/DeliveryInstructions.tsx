import { Hand, DoorOpen, Phone, Building2 } from "lucide-react";
import { useState } from "react";

const OPTIONS = [
  { value: "hand", label: "Remise en main propre", icon: Hand },
  { value: "door", label: "Déposer devant la porte", icon: DoorOpen },
  { value: "call", label: "Appeler à l'arrivée", icon: Phone },
  { value: "reception", label: "Laisser à la réception", icon: Building2 },
];

interface Props {
  selected: string;
  onSelect: (v: string) => void;
  comment: string;
  onCommentChange: (v: string) => void;
}

const DeliveryInstructions = ({ selected, onSelect, comment, onCommentChange }: Props) => (
  <div className="rounded-xl border bg-card p-4 shadow-card">
    <h3 className="mb-3 text-sm font-bold text-card-foreground">Instructions de livraison</h3>
    <div className="grid grid-cols-2 gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => onSelect(value)}
          className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
            selected === value
              ? "border-primary bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:border-primary/30"
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </button>
      ))}
    </div>
    <textarea
      value={comment}
      onChange={(e) => onCommentChange(e.target.value.slice(0, 200))}
      placeholder="Commentaire pour le livreur (optionnel)…"
      rows={2}
      className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
    />
  </div>
);

export default DeliveryInstructions;
