import { useState, useEffect } from "react";

interface CashDenominationSelectorProps {
  orderTotal: number;
  onDetailsChange?: (details: { counts: Record<number, number>; total: number }) => void;
}

const BILLS = [
  { value: 100, label: "100 €", type: "bill" },
  { value: 50, label: "50 €", type: "bill" },
  { value: 20, label: "20 €", type: "bill" },
  { value: 10, label: "10 €", type: "bill" },
  { value: 5, label: "5 €", type: "bill" },
];

const COINS = [
  { value: 2, label: "2 €", type: "coin" },
  { value: 1, label: "1 €", type: "coin" },
  { value: 0.5, label: "50c", type: "coin" },
];

const CashDenominationSelector = ({ orderTotal, onDetailsChange }: CashDenominationSelectorProps) => {
  const [counts, setCounts] = useState<Record<number, number>>({});

  const total = Object.entries(counts).reduce((s, [val, qty]) => s + Number(val) * qty, 0);
  const change = total - orderTotal;

  useEffect(() => {
    onDetailsChange?.({ counts, total });
  }, [counts, total, onDetailsChange]);

  const increment = (val: number) => setCounts((p) => ({ ...p, [val]: (p[val] || 0) + 1 }));
  const decrement = (val: number) =>
    setCounts((p) => {
      const n = (p[val] || 0) - 1;
      if (n <= 0) {
        const { [val]: _, ...rest } = p;
        return rest;
      }
      return { ...p, [val]: n };
    });

  const reset = () => setCounts({});

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-card-foreground">Préparez votre monnaie</h3>

      {/* Bills */}
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Billets</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {BILLS.map((b) => (
          <button
            key={b.value}
            onClick={() => increment(b.value)}
            className="relative rounded-lg border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
          >
            {b.label}
            {(counts[b.value] || 0) > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {counts[b.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Coins */}
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Pièces</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {COINS.map((c) => (
          <button
            key={c.value}
            onClick={() => increment(c.value)}
            className="relative rounded-full border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
          >
            {c.label}
            {(counts[c.value] || 0) > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {counts[c.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="space-y-1.5 text-sm border-t pt-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total commande</span>
          <span className="font-semibold text-foreground">{orderTotal.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Montant donné</span>
          <span className="font-bold text-foreground">{total.toFixed(2)} €</span>
        </div>
        {total >= orderTotal && (
          <div className="flex justify-between border-t pt-1.5">
            <span className="font-bold text-foreground">Monnaie à rendre</span>
            <span className="text-lg font-extrabold text-success">{change.toFixed(2)} €</span>
          </div>
        )}
        {total > 0 && total < orderTotal && (
          <p className="text-xs text-destructive">Il manque {(orderTotal - total).toFixed(2)} €</p>
        )}
      </div>

      {Object.keys(counts).length > 0 && (
        <button onClick={reset}
          className="mt-3 w-full rounded-lg border py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          Réinitialiser
        </button>
      )}
    </div>
  );
};

export default CashDenominationSelector;
