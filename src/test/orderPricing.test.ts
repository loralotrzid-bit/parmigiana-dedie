import { describe, expect, it } from "vitest";
import { priceOptions, type PricingGroup } from "../../supabase/functions/_shared/orderPricing";

const option = (name: string, price = 2) => ({ name, price_supplement: price, is_available: true, option_group_id: "g" });
const group = (overrides: Partial<PricingGroup> = {}): PricingGroup => ({
  id: "g", name: "Extras", is_required: false, min_selections: 0, max_selections: 3,
  free_count: 0, group_price: null, pricing_mode: "standard", is_menu_only: false,
  options: [option("A"), option("B", 3), option("C", 4)], ...overrides,
});
const price = (names: string[], g = group()) => priceOptions(names.map((name) => ({ name, price: -999 })), [g], [], "Menu", 5);

describe("server catalogue pricing", () => {
  it("ignores forged frontend prices", () => expect(price(["A", "B"]).supplement).toBe(5));
  it("honours free choices in catalogue order", () => expect(price(["B", "A"], group({ free_count: 1 })).supplement).toBe(3));
  it("uses the configured group price", () => expect(price(["A", "B"], group({ group_price: 1 })).supplement).toBe(2));
  it("charges per pair", () => expect(price(["A", "B", "C"], group({ pricing_mode: "pair", group_price: 1 })).supplement).toBe(2));
  it("uses the actual menu supplement in stored choices", () => expect(price(["Menu"]).choices).toEqual([{ name: "Menu", price: 5 }]));
  it("rejects unknown options", () => expect(() => price(["forged"])).toThrow());
  it("rejects unavailable options", () => expect(() => price(["A"], group({ options: [{ ...option("A"), is_available: false }] }))).toThrow());
  it("rejects duplicates", () => expect(() => price(["A", "A"])).toThrow());
  it("rejects ambiguous legacy names", () => expect(() => price(["A"], group({ options: [option("A"), option("A")] }))).toThrow());
  it("requires mandatory selections", () => expect(() => price([], group({ is_required: true }))).toThrow());
  it("enforces optional minimum once selected", () => expect(() => price(["A"], group({ min_selections: 2 }))).toThrow());
  it("enforces maximum", () => expect(() => price(["A", "B"], group({ max_selections: 1 }))).toThrow());
  it("rejects menu-only choices without formula", () => expect(() => price(["A"], group({ is_menu_only: true }))).toThrow());
  it("accepts menu-only choices with formula", () => expect(price(["Menu", "A"], group({ is_menu_only: true })).supplement).toBe(7));
  it("rejects an unavailable formula", () => expect(() => priceOptions([{ name: "Menu" }], [], [], "Menu", null)).toThrow());
  it("prices ungrouped supplements", () => expect(priceOptions([{ name: "A" }], [], [option("A")], "Menu", null).supplement).toBe(2));
});
