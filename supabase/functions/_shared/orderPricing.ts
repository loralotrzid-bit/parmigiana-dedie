export interface PricingOption {
  name: string;
  price_supplement: number;
  is_available: boolean;
  option_group_id: string | null;
}

export interface PricingGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  free_count: number;
  group_price: number | null;
  pricing_mode: string;
  is_menu_only: boolean;
  options: PricingOption[];
}

/** Uses only catalogue prices. Legacy carts identify options by name. */
export function priceOptions(
  selected: { name: string; price?: number }[],
  groups: PricingGroup[],
  ungrouped: PricingOption[],
  menuLabel: string,
  menuSupplement: number | null,
) {
  const choices: { name: string; price: number }[] = [];
  const names = new Set<string>();
  for (const option of selected) {
    if (names.has(option.name)) throw new Error("Option sélectionnée plusieurs fois");
    names.add(option.name);
  }
  const hasMenu = names.has(menuLabel);
  if (hasMenu) {
    if (menuSupplement == null) throw new Error("Option menu non disponible");
    choices.push({ name: menuLabel, price: menuSupplement });
  }
  const activeGroups = groups.filter((g) => !g.is_menu_only || hasMenu);
  const candidates = [...activeGroups.flatMap((g) => g.options), ...ungrouped]
    .filter((o) => o.is_available);
  for (const name of names) {
    if (name === menuLabel) continue;
    const matches = candidates.filter((o) => o.name === name);
    if (matches.length !== 1) throw new Error("Option inconnue, indisponible ou ambiguë");
  }
  for (const group of activeGroups) {
    const options = group.options.filter((o) => o.is_available && names.has(o.name));
    const min = group.is_required ? Math.max(group.min_selections || 0, 1) : (group.min_selections || 0);
    if ((group.is_required || options.length > 0) && options.length < min) {
      throw new Error(`Minimum ${min} sélection(s) pour "${group.name}"`);
    }
    if (options.length > group.max_selections) throw new Error(`Trop de sélections pour "${group.name}"`);
    options.forEach((o, index) => {
      const price = group.pricing_mode === "pair"
        ? (index % 2 === 0 ? group.group_price ?? 0 : 0)
        : index < (group.free_count || 0) ? 0 : group.group_price ?? Number(o.price_supplement);
      choices.push({ name: o.name, price });
    });
  }
  for (const option of ungrouped) {
    if (option.is_available && names.has(option.name)) {
      choices.push({ name: option.name, price: Number(option.price_supplement) });
    }
  }
  if (choices.some((o) => !Number.isFinite(o.price))) throw new Error("Tarif de catalogue invalide");
  return { choices, supplement: choices.reduce((sum, o) => sum + o.price, 0) };
}
