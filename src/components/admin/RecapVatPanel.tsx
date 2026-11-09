import { useMemo } from "react";
import { computeVat, getVatRateForOrderType, type VatRateKey, orderTypeLabel, paymentMethodLabel } from "@/lib/vatUtils";
import type { Tables } from "@/integrations/supabase/types";

type VatOrder = Pick<Tables<"orders">, "total" | "order_type" | "payment_method">;

interface Props {
  orders: VatOrder[];
  overrideRate: VatRateKey | null;
}

const RecapVatPanel = ({ orders, overrideRate }: Props) => {
  const stats = useMemo(() => {
    let totalCash = 0, totalCard = 0, totalWero = 0;
    let countCash = 0, countCard = 0, countWero = 0;
    const vatBuckets: Record<string, { htva: number; tva: number; tvac: number; count: number }> = {
      "6": { htva: 0, tva: 0, tvac: 0, count: 0 },
      "12": { htva: 0, tva: 0, tvac: 0, count: 0 },
      "21": { htva: 0, tva: 0, tvac: 0, count: 0 },
    };

    orders.forEach((o) => {
      const total = Number(o.total);
      const pm = o.payment_method || "cash";
      if (pm === "cash") { totalCash += total; countCash++; }
      else if (pm === "card_delivery") { totalCard += total; countCard++; }
      else if (pm === "wero") { totalWero += total; countWero++; }

      const rate = overrideRate || getVatRateForOrderType(o.order_type || "takeaway");
      const v = computeVat(total, rate);
      vatBuckets[rate].htva += v.htva;
      vatBuckets[rate].tva += v.tva;
      vatBuckets[rate].tvac += v.tvac;
      vatBuckets[rate].count++;
    });

    return { totalCash, totalCard, totalWero, countCash, countCard, countWero, vatBuckets };
  }, [orders, overrideRate]);

  const totalGlobal = stats.totalCash + stats.totalCard + stats.totalWero;

  return (
    <div className="space-y-3">
      {/* Payment stats */}
      <div className="rounded-xl border bg-card p-3 shadow-card">
        <h4 className="text-xs font-bold text-foreground mb-2">💰 Statistiques paiements</h4>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-sm font-extrabold text-foreground">{stats.totalCash.toFixed(2)} €</p>
            <p className="text-[10px] text-muted-foreground">Cash ({stats.countCash})</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-sm font-extrabold text-foreground">{stats.totalCard.toFixed(2)} €</p>
            <p className="text-[10px] text-muted-foreground">Carte ({stats.countCard})</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-sm font-extrabold text-foreground">{stats.totalWero.toFixed(2)} €</p>
            <p className="text-[10px] text-muted-foreground">Wero ({stats.countWero})</p>
          </div>
        </div>
      </div>

      {/* VAT breakdown */}
      <div className="rounded-xl border bg-card p-3 shadow-card">
        <h4 className="text-xs font-bold text-foreground mb-2">🧾 Ventilation TVA</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-1.5 font-semibold text-muted-foreground">Taux</th>
                <th className="text-right py-1.5 font-semibold text-muted-foreground">Cmd</th>
                <th className="text-right py-1.5 font-semibold text-muted-foreground">HTVA</th>
                <th className="text-right py-1.5 font-semibold text-muted-foreground">TVA</th>
                <th className="text-right py-1.5 font-semibold text-muted-foreground">TVAC</th>
              </tr>
            </thead>
            <tbody>
              {(["6", "12", "21"] as const).map((rate) => {
                const b = stats.vatBuckets[rate];
                if (b.count === 0) return null;
                return (
                  <tr key={rate} className="border-b border-border/30">
                    <td className="py-1.5 font-bold text-foreground">{rate} %</td>
                    <td className="text-right text-muted-foreground">{b.count}</td>
                    <td className="text-right font-semibold text-foreground">{b.htva.toFixed(2)} €</td>
                    <td className="text-right font-semibold text-primary">{b.tva.toFixed(2)} €</td>
                    <td className="text-right font-bold text-foreground">{b.tvac.toFixed(2)} €</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="pt-2 text-foreground">Total</td>
                <td className="pt-2 text-right text-muted-foreground">{orders.length}</td>
                <td className="pt-2 text-right text-foreground">
                  {Object.values(stats.vatBuckets).reduce((s, b) => s + b.htva, 0).toFixed(2)} €
                </td>
                <td className="pt-2 text-right text-primary">
                  {Object.values(stats.vatBuckets).reduce((s, b) => s + b.tva, 0).toFixed(2)} €
                </td>
                <td className="pt-2 text-right text-foreground">{totalGlobal.toFixed(2)} €</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RecapVatPanel;
