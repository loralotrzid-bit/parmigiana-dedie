import { useState } from "react";

interface ChangeCalculatorProps {
  orderTotal: number;
}

const BILLS = [5, 10, 20, 50, 100];

const ChangeCalculator = ({ orderTotal }: ChangeCalculatorProps) => {
  const [received, setReceived] = useState(0);
  const change = received - orderTotal;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-card-foreground">Caisse</h3>

      {/* Bill buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        {BILLS.map((bill) => (
          <button
            key={bill}
            onClick={() => setReceived((prev) => prev + bill)}
            className="rounded-lg border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
          >
            {bill} €
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total commande</span>
          <span className="font-semibold text-foreground">{orderTotal.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Reçu</span>
          <span className="font-bold text-foreground">{received.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between border-t pt-1.5">
          <span className="font-bold text-foreground">À rendre</span>
          <span className={`text-lg font-extrabold ${change >= 0 ? "text-success" : "text-destructive"}`}>
            {change >= 0 ? change.toFixed(2) : "0.00"} €
          </span>
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={() => setReceived(0)}
        className="mt-3 w-full rounded-lg border py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Réinitialiser
      </button>
    </div>
  );
};

export default ChangeCalculator;
