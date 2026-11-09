import { expect, it } from "vitest";
import { menuBasePrice, isWeekend } from "../../supabase/functions/_shared/menuPricing";
it("preserves dine-in PDF price", () => expect(menuBasePrice(11,"dine_in",true,1)).toBe(11));
it("deducts one euro from each takeaway article", () => expect(menuBasePrice(11,"takeaway",true,1)).toBe(10));
it("does not change another restaurant", () => expect(menuBasePrice(11,"takeaway",false,1)).toBe(11));
it("calculates cents without negative totals", () => expect(menuBasePrice(2.5,"takeaway",true,1)).toBe(1.5));
it("uses Brussels business time", () => expect(isWeekend(new Date('2026-10-24T12:00:00Z'))).toBe(true));
