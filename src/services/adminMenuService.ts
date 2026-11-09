import { supabase } from "@/integrations/supabase/client";

// ─── Categories ──────────────────────────────────────────

export async function createCategory(restaurantId: string, name: string, sortOrder: number) {
  const { data, error } = await supabase
    .from("categories")
    .insert({ restaurant_id: restaurantId, name, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(categoryId: string, updates: { name?: string; is_published?: boolean; sort_order?: number; is_visible_to_client?: boolean }) {
  const { data, error } = await supabase
    .from("categories")
    .update(updates)
    .eq("id", categoryId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(categoryId: string) {
  // First delete all product_options and product_option_groups for products in this category
  const { data: products } = await supabase
    .from("products")
    .select("id")
    .eq("category_id", categoryId);
  
  if (products && products.length > 0) {
    const productIds = products.map(p => p.id);
    // Delete option groups (options cascade via FK)
    await supabase.from("product_option_groups").delete().in("product_id", productIds);
    await supabase.from("product_options").delete().in("product_id", productIds);
    // Delete products
    await supabase.from("products").delete().eq("category_id", categoryId);
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);
  if (error) throw error;
}

// ─── Products ────────────────────────────────────────────

export async function createProduct(categoryId: string, data: { name: string; price: number; description?: string; sort_order?: number }) {
  const { data: product, error } = await supabase
    .from("products")
    .insert({ category_id: categoryId, ...data })
    .select()
    .single();
  if (error) throw error;
  return product;
}

export async function updateProduct(productId: string, updates: { name?: string; price?: number; description?: string; is_published?: boolean; is_available?: boolean; sort_order?: number; image_url?: string | null; is_featured?: boolean; menu_supplement?: number | null; menu_label?: string | null }) {
  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", productId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(productId: string) {
  // Delete related options and option groups first
  await supabase.from("product_option_groups").delete().eq("product_id", productId);
  await supabase.from("product_options").delete().eq("product_id", productId);
  
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);
  if (error) throw error;
}

// ─── Bulk clone option groups ────────────────────────────

export async function cloneOptionGroupsToProducts(sourceProductId: string, targetProductIds: string[]) {
  if (targetProductIds.length === 0) return;

  // Fetch source groups + options
  const [{ data: groups, error: gErr }, { data: options, error: oErr }] = await Promise.all([
    supabase.from("product_option_groups").select("*").eq("product_id", sourceProductId),
    supabase.from("product_options").select("*").eq("product_id", sourceProductId),
  ]);
  if (gErr) throw gErr;
  if (oErr) throw oErr;
  if (!groups || groups.length === 0) throw new Error("Aucun groupe d'options à copier");

  for (const targetId of targetProductIds) {
    // Clear existing groups/options on target
    await supabase.from("product_options").delete().eq("product_id", targetId);
    await supabase.from("product_option_groups").delete().eq("product_id", targetId);

    // Clone groups
    for (const g of groups) {
      const { id: _gid, created_at: _gc, product_id: _gp, ...groupData } = g;
      const { data: newGroup, error: ngErr } = await supabase
        .from("product_option_groups")
        .insert({ ...groupData, product_id: targetId })
        .select("id")
        .single();
      if (ngErr) throw ngErr;

      // Clone options for this group
      const groupOptions = (options || []).filter((o) => o.option_group_id === g.id);
      if (groupOptions.length > 0) {
        const newOptions = groupOptions.map((o) => {
          const { id: _oid, created_at: _oc, product_id: _op, option_group_id: _og, ...optData } = o;
          return { ...optData, product_id: targetId, option_group_id: newGroup.id };
        });
        const { error: noErr } = await supabase.from("product_options").insert(newOptions);
        if (noErr) throw noErr;
      }
    }
  }
}
