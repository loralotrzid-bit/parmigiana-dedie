export function menuBasePrice(price: number, orderType: string, enabled: boolean, discount: number): number {
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(discount) || discount < 0) throw new Error("Tarif invalide");
  return Math.round(Math.max(0, price - (enabled && orderType === "takeaway" ? discount : 0)) * 100) / 100;
}

export function isWeekend(now = new Date()): boolean {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", weekday: "short" }).format(now);
  return day === "Sat" || day === "Sun";
}
