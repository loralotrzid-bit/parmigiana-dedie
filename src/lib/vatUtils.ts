/**
 * Belgian VAT utilities — all prices in the system are TVAC (tax-included).
 */

export const VAT_RATES = {
  "6": 0.06,
  "12": 0.12,
  "21": 0.21,
} as const;

export type VatRateKey = keyof typeof VAT_RATES;

/** Determine default Belgian VAT rate based on order type */
export function getVatRateForOrderType(orderType: string): VatRateKey {
  switch (orderType) {
    case "dine_in": return "12";
    case "takeaway": return "6";
    case "delivery": return "6";
    default: return "6";
  }
}

/** From a TVAC amount, compute HTVA and TVA */
export function computeVat(tvac: number, rateKey: VatRateKey) {
  const rate = VAT_RATES[rateKey];
  const htva = tvac / (1 + rate);
  const tva = tvac - htva;
  return { htva, tva, tvac, rate, rateKey };
}

/** Apply a forced override rate to a TVAC amount (for export conversion) */
export function convertVat(tvac: number, fromRate: VatRateKey, toRate: VatRateKey) {
  const htva = tvac / (1 + VAT_RATES[fromRate]);
  const newTvac = htva * (1 + VAT_RATES[toRate]);
  const newTva = newTvac - htva;
  return { htva, tva: newTva, tvac: newTvac, rateKey: toRate };
}

export const orderTypeLabel = (t: string) => {
  const map: Record<string, string> = {
    dine_in: "Sur place", takeaway: "À emporter", delivery: "Livraison",
  };
  return map[t] || t;
};

export const paymentMethodLabel = (m: string) => {
  const map: Record<string, string> = {
    cash: "Espèces", card_delivery: "Carte", wero: "Wero",
  };
  return map[m] || m;
};
