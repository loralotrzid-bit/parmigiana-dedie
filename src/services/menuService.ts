/**
 * Menu & product options fetching — REST-first with Supabase JS fallback.
 *
 * Strategy:
 * 1. REST API for categories + products (parallel, with timeout)
 * 2. Supabase JS fallback only if REST fails
 * 3. localStorage persistence for instant re-render
 * 4. In-memory TTL cache (via cache.ts) + request deduplication
 *
 * ✅ AbortController with 6s timeout on all REST calls
 * ✅ Linked category products fetched via REST first
 * ✅ Single fetch for linked products (no duplicate query)
 */

import { supabase } from "@/integrations/supabase/client";
import { cached, TTL } from "@/lib/cache";
import { restQuery, withTimeout } from "@/lib/restClient";
import { persistGet, persistSet } from "@/lib/persistCache";
import { logger } from "@/lib/logger";
import type { Tables } from "@/integrations/supabase/types";

export type MenuCategory = Tables<"categories"> & { products: Tables<"products">[] };
export type OptionGroup = Tables<"product_option_groups">;
export type ProductOption = Tables<"product_options">;
type LinkedProduct = Pick<Tables<"products">, "id" | "name" | "price" | "is_available" | "sort_order" | "category_id">;
type VirtualProductOption = Omit<ProductOption, "product_id" | "price_supplement" | "created_at" | "is_available"> & {
  is_available: boolean;
  price_supplement: number;
};
export type ProductOptionGroup = OptionGroup & { options: (ProductOption | VirtualProductOption)[] };

const TAG = "[restaurant-menu]";

// ── Menu fetching ───────────────────────────────────────────────────

export async function fetchMenuByRestaurantId(restaurantId: string, publishedOnly = true) {
  const cacheKey = `menu:${restaurantId}:${publishedOnly}`;
  return cached(cacheKey, TTL.MENU, async () => {
    const t0 = performance.now();
    const { ac, cleanup } = withTimeout(6000);

    try {
      // ── Step 1: fetch categories (REST-first) ─────────────────
      let cats: Tables<"categories">[] = [];
      try {
        const restParams: Record<string, string> = {
          select: "*",
          restaurant_id: `eq.${restaurantId}`,
          order: "sort_order.asc",
        };
        if (publishedOnly) restParams.is_published = "eq.true";
        cats = await restQuery<Tables<"categories">>(TAG, "categories", restParams, ac.signal);
      } catch (e) {
        logger.debug(`${TAG} REST categories failed, falling back`, e);
        let catsQuery = supabase
          .from("categories")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("sort_order");
        if (publishedOnly) catsQuery = catsQuery.eq("is_published", true);
        const { data, error } = await catsQuery;
        if (error) throw error;
        cats = data ?? [];
      }

      if (cats.length === 0) {
        logger.debug(`${TAG} no categories for ${restaurantId}`);
        return [];
      }

      // Filter out categories hidden from client
      const visibleCats = publishedOnly
        ? cats.filter((category) => category.is_visible_to_client !== false)
        : cats;

      // ── Step 2: fetch products (REST-first) ───────────────────
      const catIds = publishedOnly ? visibleCats.map((c) => c.id) : cats.map((c) => c.id);
      let prods: Tables<"products">[] = [];

      try {
        const restParams: Record<string, string> = {
          select: "*",
          category_id: `in.(${catIds.join(",")})`,
          order: "sort_order.asc",
        };
        if (publishedOnly) restParams.is_published = "eq.true";
        prods = await restQuery<Tables<"products">>(TAG, "products", restParams, ac.signal);
      } catch (e) {
        logger.debug(`${TAG} REST products failed, falling back`, e);
        let prodsQuery = supabase
          .from("products")
          .select("*")
          .in("category_id", catIds)
          .order("sort_order");
        if (publishedOnly) prodsQuery = prodsQuery.eq("is_published", true);
        const { data, error } = await prodsQuery;
        if (error) throw error;
        prods = data ?? [];
      }

      const targetCats = publishedOnly ? visibleCats : cats;
      const result: MenuCategory[] = targetCats.map((cat) => ({
        ...cat,
        products: prods.filter((p) => p.category_id === cat.id),
      }));

      logger.debug(`${TAG} menu loaded: ${targetCats.length} cats, ${prods.length} products (${Math.round(performance.now() - t0)}ms)`);

      // Persist for instant re-render on next visit
      if (publishedOnly && result.length > 0) {
        persistSet(`menu:${restaurantId}`, result);
      }
      return result;
    } finally {
      cleanup();
    }
  });
}

// ── First restaurant ID (admin bootstrap) ───────────────────────────

export async function fetchFirstRestaurantId() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .limit(1)
    .single();
  if (error) throw error;
  return data.id;
}

// ── Bulk prefetch all options for a restaurant (2 queries instead of 2N) ──

export async function prefetchAllProductOptions(
  productIds: string[],
  setCacheEntry: (key: string, data: ProductOptionGroup[]) => void
) {
  if (!productIds.length) return;

  const t0 = performance.now();
  const { ac, cleanup } = withTimeout(8000);

  try {
    // 2 queries total for ALL products
    const [allGroups, allOptions] = await Promise.all([
      restQuery<OptionGroup>(TAG, "product_option_groups", {
        select: "*",
        product_id: `in.(${productIds.join(",")})`,
        order: "sort_order.asc",
      }, ac.signal),
      restQuery<ProductOption>(TAG, "product_options", {
        select: "*",
        product_id: `in.(${productIds.join(",")})`,
        is_available: "eq.true",
        order: "sort_order.asc",
      }, ac.signal),
    ]);

    // Collect linked category IDs
    const linkedCategoryIds = allGroups
      .map((group) => group.linked_category_id)
      .filter((id: string | null): id is string => !!id);

    const linkedProducts: Record<string, LinkedProduct[]> = {};
    if (linkedCategoryIds.length > 0) {
      try {
        const catProds = await restQuery<LinkedProduct>(TAG, "products", {
          select: "id,name,price,is_available,sort_order,category_id",
          category_id: `in.(${[...new Set(linkedCategoryIds)].join(",")})`,
          is_published: "eq.true",
          is_available: "eq.true",
          order: "sort_order.asc",
        }, ac.signal);
        for (const p of catProds) {
          if (!linkedProducts[p.category_id]) linkedProducts[p.category_id] = [];
          linkedProducts[p.category_id].push(p);
        }
      } catch { /* ignore, individual fetches will handle */ }
    }

    // Group by product_id and populate cache
    for (const pid of productIds) {
      const groups = allGroups.filter((group) => group.product_id === pid);
      const options = allOptions.filter((option) => option.product_id === pid);

      const grouped: ProductOptionGroup[] = groups.map((group) => {
        if (group.linked_category_id && linkedProducts[group.linked_category_id]) {
          const catProds = linkedProducts[group.linked_category_id];
          return {
            ...group,
            options: catProds.map((product, idx): VirtualProductOption => ({
              id: product.id,
              name: product.name,
              price_supplement: Number(product.price),
              is_available: product.is_available,
              sort_order: product.sort_order ?? idx,
              option_group_id: group.id,
            })),
          };
        }
        return {
          ...group,
          options: options.filter((option) => option.option_group_id === group.id),
        };
      });

      const ungrouped = options.filter((option) => !option.option_group_id);
      if (ungrouped.length > 0) {
        grouped.push({
          id: "__ungrouped__",
          name: "Suppléments",
          is_required: false,
          max_selections: ungrouped.length,
          min_selections: 0,
          free_count: 0,
          selection_type: "multiple",
          group_price: null,
          product_id: pid,
          sort_order: 999,
          created_at: "",
          linked_category_id: null,
          is_menu_only: false,
          pricing_mode: "standard",
          options: ungrouped,
        });
      }

      const result = grouped.filter((group) => group.options.length > 0);
      setCacheEntry(pid, result);
    }

    logger.debug(`${TAG} bulk prefetch ${productIds.length} products options (${Math.round(performance.now() - t0)}ms)`);
  } catch (e) {
    logger.warn(`${TAG} bulk prefetch failed, will fallback to individual`);
  } finally {
    cleanup();
  }
}

// ── Product options (legacy — prefer fetchProductOptionGroups) ───────

export async function fetchProductOptions(productId: string) {
  return cached(`product:options:${productId}`, TTL.PRODUCT_OPTIONS, async () => {
    const { data, error } = await supabase
      .from("product_options")
      .select("*")
      .eq("product_id", productId)
      .eq("is_available", true)
      .order("sort_order");
    if (error) throw error;
    return data;
  });
}

// ── Product option groups (REST-first, with linked categories) ──────

export async function fetchProductOptionGroups(productId: string) {
  return cached(`product:groups:${productId}`, TTL.PRODUCT_OPTIONS, async () => {
    const t0 = performance.now();
    const { ac, cleanup } = withTimeout(6000);

    try {
      // ── Fetch groups + options in parallel (REST-first) ─────────
      let groups: OptionGroup[] | null = null;
      let options: ProductOption[] | null = null;

      try {
        const [g, o] = await Promise.all([
          restQuery<OptionGroup>(TAG, "product_option_groups", {
            select: "*",
            product_id: `eq.${productId}`,
            order: "sort_order.asc",
          }, ac.signal),
          restQuery<ProductOption>(TAG, "product_options", {
            select: "*",
            product_id: `eq.${productId}`,
            is_available: "eq.true",
            order: "sort_order.asc",
          }, ac.signal),
        ]);
        groups = g;
        options = o;
        logger.debug(`${TAG} REST options for ${productId} (${Math.round(performance.now() - t0)}ms)`);
      } catch (restErr) {
        logger.debug(`${TAG} REST options failed, falling back`, restErr);
      }

      // Supabase JS fallback
      if (!groups || !options) {
        const [groupsResult, optionsResult] = await Promise.all([
          supabase
            .from("product_option_groups")
            .select("*")
            .eq("product_id", productId)
            .order("sort_order"),
          supabase
            .from("product_options")
            .select("*")
            .eq("product_id", productId)
            .eq("is_available", true)
            .order("sort_order"),
        ]);
        if (groupsResult.error) throw groupsResult.error;
        if (optionsResult.error) throw optionsResult.error;
        groups = groupsResult.data;
        options = optionsResult.data;
        logger.debug(`${TAG} Supabase JS options for ${productId} (${Math.round(performance.now() - t0)}ms)`);
      }

      // ── Linked categories: fetch products as virtual options ────
      const linkedCategoryIds = groups
        .map((g) => g.linked_category_id)
        .filter((id): id is string => !!id);

      const linkedProducts: Record<string, LinkedProduct[]> = {};
      if (linkedCategoryIds.length > 0) {
        // Single REST query with category_id included (no duplicate fetch)
        try {
          const catProds = await restQuery<LinkedProduct>(TAG, "products", {
            select: "id,name,price,is_available,sort_order,category_id",
            category_id: `in.(${linkedCategoryIds.join(",")})`,
            is_published: "eq.true",
            is_available: "eq.true",
            order: "sort_order.asc",
          }, ac.signal);
          for (const p of catProds) {
            if (!linkedProducts[p.category_id]) linkedProducts[p.category_id] = [];
            linkedProducts[p.category_id].push(p);
          }
        } catch {
          // Supabase JS fallback for linked products
          const { data: catProds } = await supabase
            .from("products")
            .select("id, name, price, is_available, sort_order, category_id")
            .in("category_id", linkedCategoryIds)
            .eq("is_published", true)
            .eq("is_available", true)
            .order("sort_order");
          if (catProds) {
            for (const p of catProds) {
              if (!linkedProducts[p.category_id]) linkedProducts[p.category_id] = [];
              linkedProducts[p.category_id].push(p);
            }
          }
        }
      }

      // ── Assemble groups with their options ──────────────────────
      const grouped: ProductOptionGroup[] = groups.map((group) => {
        if (group.linked_category_id && linkedProducts[group.linked_category_id]) {
          const catProds = linkedProducts[group.linked_category_id];
          return {
            ...group,
            options: catProds.map((product, idx): VirtualProductOption => ({
              id: product.id,
              name: product.name,
              price_supplement: Number(product.price),
              is_available: product.is_available,
              sort_order: product.sort_order ?? idx,
              option_group_id: group.id,
            })),
          };
        }
        return {
          ...group,
          options: options.filter((option) => option.option_group_id === group.id),
        };
      });

      // Ungrouped options → "Suppléments" bucket
      const ungrouped = options.filter((option) => !option.option_group_id);
      if (ungrouped.length > 0) {
        grouped.push({
          id: "__ungrouped__",
          name: "Suppléments",
          is_required: false,
          max_selections: ungrouped.length,
          min_selections: 0,
          free_count: 0,
          selection_type: "multiple",
          group_price: null,
          product_id: productId,
          sort_order: 999,
          created_at: "",
          linked_category_id: null,
          is_menu_only: false,
          pricing_mode: "standard",
          options: ungrouped,
        });
      }

      return grouped.filter((g) => g.options.length > 0);
    } finally {
      cleanup();
    }
  });
}
