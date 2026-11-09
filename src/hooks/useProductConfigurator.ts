import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchProductOptionGroups, type ProductOptionGroup } from "@/services/menuService";

export interface OptionGroup {
  id: string;
  name: string;
  is_required: boolean;
  max_selections: number;
  min_selections: number;
  free_count: number;
  selection_type: string;
  group_price: number | null;
  is_menu_only: boolean;
  pricing_mode: string;
  options: ProductOption[];
}

export interface ProductOption {
  id: string;
  name: string;
  price_supplement: number;
  is_available: boolean;
  sort_order: number;
  option_group_id: string | null;
}

export function useProductConfigurator(productId: string | null, basePrice: number, menuSupplement?: number | null) {
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [isMenuSelected, setIsMenuSelected] = useState(false);

  const hasMenuFormula = menuSupplement != null && menuSupplement > 0;

  const { data: rawGroups = [], isLoading } = useQuery<ProductOptionGroup[]>({
    queryKey: ["product-option-groups", productId],
    queryFn: () => fetchProductOptionGroups(productId!),
    enabled: !!productId,
    staleTime: 120_000,
    gcTime: 600_000,
    placeholderData: (previous) => previous,
  });

  // Normalize groups with new fields
  const allOptionGroups: OptionGroup[] = useMemo(
    () =>
      rawGroups.map((g) => ({
        ...g,
        min_selections: g.min_selections ?? 0,
        free_count: g.free_count ?? 0,
        selection_type: g.selection_type ?? (g.max_selections === 1 ? "single" : "multiple"),
        group_price: g.group_price ?? null,
        is_menu_only: g.is_menu_only ?? false,
        pricing_mode: g.pricing_mode ?? "standard",
      })),
    [rawGroups]
  );

  // Filter groups based on menu selection
  const optionGroups = useMemo(() => {
    if (!hasMenuFormula) return allOptionGroups.filter((g) => !g.is_menu_only);
    if (isMenuSelected) return allOptionGroups;
    return allOptionGroups.filter((g) => !g.is_menu_only);
  }, [allOptionGroups, hasMenuFormula, isMenuSelected]);

  const allOptions = useMemo(
    () => optionGroups.flatMap((g) => g.options),
    [optionGroups]
  );

  const toggleMenu = useCallback(() => {
    setIsMenuSelected((prev) => {
      const next = !prev;
      if (!next) {
        // Deselecting menu: remove options from menu-only groups
        setSelectedOptionIds((prevIds) => {
          const menuOnlyOptionIds = new Set(
            allOptionGroups
              .filter((g) => g.is_menu_only)
              .flatMap((g) => g.options.map((o) => o.id))
          );
          const nextIds = new Set(prevIds);
          menuOnlyOptionIds.forEach((id) => nextIds.delete(id));
          return nextIds;
        });
      }
      return next;
    });
  }, [allOptionGroups]);

  const toggleOption = useCallback(
    (optionId: string, groupId: string) => {
      setSelectedOptionIds((prev) => {
        const next = new Set(prev);
        const group = optionGroups.find((g) => g.id === groupId);
        if (!group) {
          if (next.has(optionId)) next.delete(optionId);
          else next.add(optionId);
          return next;
        }

        const isSingleSelect = group.selection_type === "single" || group.max_selections === 1;
        if (isSingleSelect) {
          const groupOptionIds = group.options.map((o) => o.id);
          groupOptionIds.forEach((id) => next.delete(id));
          if (!prev.has(optionId) || group.is_required) {
            next.add(optionId);
          }
        } else {
          if (next.has(optionId)) {
            next.delete(optionId);
          } else {
            const selectedInGroup = group.options.filter((o) => next.has(o.id)).length;
            if (selectedInGroup < group.max_selections) {
              next.add(optionId);
            }
          }
        }
        return next;
      });
    },
    [optionGroups]
  );

  const resetSelection = useCallback(() => {
    setSelectedOptionIds(new Set());
    setIsMenuSelected(false);
  }, []);

  const selectedOptions = useMemo(
    () => allOptions.filter((o) => selectedOptionIds.has(o.id)),
    [allOptions, selectedOptionIds]
  );

  // Smart pricing: free_count items are free, rest use group_price or item price
  const supplement = useMemo(() => {
    let total = 0;
    for (const group of optionGroups) {
      const selectedInGroup = group.options.filter((o) => selectedOptionIds.has(o.id));
      if (group.pricing_mode === "pair") {
        // Pair pricing: ceil(count/2) * group_price (e.g. 1=1€, 2=1€, 3=2€, 4=2€)
        total += Math.ceil(selectedInGroup.length / 2) * (group.group_price ?? 0);
      } else {
        selectedInGroup.forEach((opt, idx) => {
          if (idx < group.free_count) return; // free
          const price = group.group_price != null ? group.group_price : Number(opt.price_supplement);
          total += price;
        });
      }
    }
    return total;
  }, [optionGroups, selectedOptionIds]);

  const menuExtra = isMenuSelected && hasMenuFormula ? menuSupplement! : 0;
  const finalPrice = basePrice + supplement + menuExtra;

  // Validation: all required groups meet min_selections
  const allRequiredSelected = useMemo(() => {
    return optionGroups
      .filter((g) => g.is_required)
      .every((g) => {
        const count = g.options.filter((o) => selectedOptionIds.has(o.id)).length;
        const min = Math.max(g.min_selections, 1); // required means at least 1
        return count >= min;
      });
  }, [optionGroups, selectedOptionIds]);

  // Per-group selection count for UI
  const getGroupSelectionCount = useCallback(
    (groupId: string) => {
      const group = optionGroups.find((g) => g.id === groupId);
      if (!group) return 0;
      return group.options.filter((o) => selectedOptionIds.has(o.id)).length;
    },
    [optionGroups, selectedOptionIds]
  );

  // Per-group remaining count for UI
  const getGroupRemaining = useCallback(
    (groupId: string) => {
      const group = optionGroups.find((g) => g.id === groupId);
      if (!group) return 0;
      const selected = group.options.filter((o) => selectedOptionIds.has(o.id)).length;
      return group.max_selections - selected;
    },
    [optionGroups, selectedOptionIds]
  );

  // Check if an option would be free
  const isOptionFree = useCallback(
    (optionId: string, groupId: string) => {
      const group = optionGroups.find((g) => g.id === groupId);
      if (!group || group.free_count === 0) return false;
      const selectedInGroup = group.options.filter((o) => selectedOptionIds.has(o.id));
      if (selectedOptionIds.has(optionId)) {
        const idx = selectedInGroup.findIndex((o) => o.id === optionId);
        return idx < group.free_count;
      }
      return selectedInGroup.length < group.free_count;
    },
    [optionGroups, selectedOptionIds]
  );

  return {
    optionGroups,
    options: allOptions,
    isLoading,
    selectedOptionIds,
    selectedOptions,
    toggleOption,
    resetSelection,
    setSelectedOptionIds,
    finalPrice,
    supplement,
    menuExtra,
    allRequiredSelected,
    getGroupSelectionCount,
    getGroupRemaining,
    isOptionFree,
    hasMenuFormula,
    isMenuSelected,
    toggleMenu,
  };
}
