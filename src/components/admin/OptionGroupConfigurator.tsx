import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Settings2, ChevronDown, ChevronUp, Check, X, Loader2, Link2, Unlink } from "lucide-react";
import { safeToast } from "@/lib/safeToast";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  productId: string;
  productName: string;
  restaurantId: string;
  onClose: () => void;
}

interface OptionGroup {
  id: string;
  name: string;
  is_required: boolean;
  max_selections: number;
  min_selections: number;
  free_count: number;
  selection_type: string;
  group_price: number | null;
  sort_order: number;
  linked_category_id: string | null;
  is_menu_only: boolean;
}

interface Option {
  id: string;
  name: string;
  price_supplement: number;
  is_available: boolean;
  sort_order: number;
  option_group_id: string | null;
}

type ConfiguredOptionGroup = Tables<"product_option_groups"> & { options: Tables<"product_options">[] };

const OptionGroupConfigurator = ({ productId, productName, restaurantId, onClose }: Props) => {
  const queryClient = useQueryClient();
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionPrice, setNewOptionPrice] = useState("");
  const [addingOptionGroupId, setAddingOptionGroupId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-option-groups", productId] });
    queryClient.invalidateQueries({ queryKey: ["product-option-groups", productId] });
  };

  // Fetch categories for linking
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("restaurant_id", restaurantId)
        .eq("is_published", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  // Fetch groups
  const { data: groups = [], isLoading: groupsLoading } = useQuery<ConfiguredOptionGroup[]>({
    queryKey: ["admin-option-groups", productId],
    queryFn: async () => {
      const [groupsRes, optionsRes] = await Promise.all([
        supabase.from("product_option_groups").select("*").eq("product_id", productId).order("sort_order"),
        supabase.from("product_options").select("*").eq("product_id", productId).order("sort_order"),
      ]);
      if (groupsRes.error) throw groupsRes.error;
      if (optionsRes.error) throw optionsRes.error;
      return groupsRes.data.map((group) => ({
        ...group,
        options: optionsRes.data.filter((option) => option.option_group_id === group.id),
      }));
    },
  });

  // Fetch linked category products count
  const linkedCategoryIds = groups
    .map((group) => group.linked_category_id)
    .filter((id): id is string => id !== null);

  const { data: linkedProductCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["linked-category-counts", linkedCategoryIds],
    queryFn: async () => {
      if (linkedCategoryIds.length === 0) return {};
      const { data, error } = await supabase
        .from("products")
        .select("category_id")
        .in("category_id", linkedCategoryIds)
        .eq("is_published", true)
        .eq("is_available", true);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const p of data) {
        counts[p.category_id] = (counts[p.category_id] || 0) + 1;
      }
      return counts;
    },
    enabled: linkedCategoryIds.length > 0,
  });

  // Create group
  const createGroupMut = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("product_option_groups").insert({
        product_id: productId,
        name,
        sort_order: (groups?.length || 0) + 1,
        is_required: false,
        max_selections: 5,
        min_selections: 0,
        free_count: 0,
        selection_type: "multiple",
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setNewGroupName(""); setShowNewGroup(false); safeToast.success("Groupe créé"); },
    onError: (error) => safeToast.error(error.message),
  });

  // Update group
  const updateGroupMut = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<OptionGroup> }) => {
      const { error } = await supabase.from("product_option_groups").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); safeToast.success("Groupe mis à jour"); },
    onError: (error) => safeToast.error(error.message),
  });

  // Delete group
  const deleteGroupMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("product_options").delete().eq("option_group_id", id);
      const { error } = await supabase.from("product_option_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); safeToast.success("Groupe supprimé"); },
    onError: (error) => safeToast.error(error.message),
  });

  // Create option
  const createOptionMut = useMutation({
    mutationFn: async ({ groupId, name, price }: { groupId: string; name: string; price: number }) => {
      const group = groups.find((candidate) => candidate.id === groupId);
      const { error } = await supabase.from("product_options").insert({
        product_id: productId,
        option_group_id: groupId,
        name,
        price_supplement: price,
        sort_order: (group?.options?.length || 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setNewOptionName(""); setNewOptionPrice(""); setAddingOptionGroupId(null); safeToast.success("Option ajoutée"); },
    onError: (error) => safeToast.error(error.message),
  });

  // Delete option
  const deleteOptionMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_options").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); },
    onError: (error) => safeToast.error(error.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[85vh] rounded-2xl bg-card shadow-elevated overflow-hidden flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold text-foreground">Configuration des options</h2>
            <p className="text-xs text-muted-foreground">{productName}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {groupsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : groups.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Aucun groupe d'options. Ajoutez-en un.</p>
          ) : (
            groups.map((group) => {
              const isExpanded = expandedGroupId === group.id;
              const isLinked = !!group.linked_category_id;
              const linkedCatName = categories.find((c) => c.id === group.linked_category_id)?.name;
              const linkedCount = isLinked && group.linked_category_id ? linkedProductCounts[group.linked_category_id] || 0 : 0;

              return (
                <div key={group.id} className="rounded-xl border bg-background">
                  {/* Group header */}
                  <button
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold text-foreground">{group.name}</span>
                      {isLinked ? (
                        <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
                          <Link2 className="h-3 w-3" />
                          {linkedCatName} ({linkedCount})
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          ({group.options?.length || 0} items)
                        </span>
                      )}
                      {group.is_required && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Requis</span>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-3">
                      {/* Category link selector */}
                      <div className="rounded-lg border-2 border-dashed border-primary/20 bg-primary/5 p-3 space-y-2">
                        <p className="text-[10px] font-bold text-primary uppercase flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          Lier à une catégorie
                        </p>
                        <div className="flex items-center gap-2">
                          <select
                            value={group.linked_category_id || ""}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              updateGroupMut.mutate({ id: group.id, updates: { linked_category_id: val } });
                            }}
                            className="flex-1 rounded border bg-background px-2 py-1.5 text-xs"
                          >
                            <option value="">— Aucune (options manuelles) —</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                          {isLinked && (
                            <button
                              onClick={() => updateGroupMut.mutate({ id: group.id, updates: { linked_category_id: null } })}
                              className="text-muted-foreground hover:text-destructive"
                              title="Délier"
                            >
                              <Unlink className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        {isLinked && (
                          <p className="text-[10px] text-muted-foreground">
                            ✅ {linkedCount} produit{linkedCount > 1 ? "s" : ""} de « {linkedCatName} » seront proposés automatiquement.
                            Les ajouts/suppressions dans cette catégorie se reflèteront en temps réel.
                          </p>
                        )}
                      </div>

                      {/* Config toggles */}
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={group.is_required}
                            onChange={(e) => updateGroupMut.mutate({ id: group.id, updates: { is_required: e.target.checked } })}
                            className="rounded"
                          />
                          <span className="font-medium text-foreground">Obligatoire</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={group.is_menu_only || false}
                            onChange={(e) => updateGroupMut.mutate({ id: group.id, updates: { is_menu_only: e.target.checked } })}
                            className="rounded"
                          />
                          <span className="font-medium text-foreground">Menu uniquement</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs col-span-2">
                          <select
                            value={group.selection_type}
                            onChange={(e) => updateGroupMut.mutate({
                              id: group.id,
                              updates: {
                                selection_type: e.target.value,
                                max_selections: e.target.value === "single" ? 1 : group.max_selections,
                              },
                            })}
                            className="rounded border bg-background px-2 py-1 text-xs"
                          >
                            <option value="single">Choix unique</option>
                            <option value="multiple">Choix multiple</option>
                          </select>
                        </label>
                      </div>

                      {/* Numeric configs */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground">Min. sélections</label>
                          <input
                            type="number" min="0"
                            value={group.min_selections}
                            onChange={(e) => updateGroupMut.mutate({ id: group.id, updates: { min_selections: parseInt(e.target.value) || 0 } })}
                            className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground">Max. sélections</label>
                          <input
                            type="number" min="1"
                            value={group.max_selections}
                            onChange={(e) => updateGroupMut.mutate({ id: group.id, updates: { max_selections: parseInt(e.target.value) || 1 } })}
                            className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                            disabled={group.selection_type === "single"}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground">Nb gratuits</label>
                          <input
                            type="number" min="0"
                            value={group.free_count}
                            onChange={(e) => updateGroupMut.mutate({ id: group.id, updates: { free_count: parseInt(e.target.value) || 0 } })}
                            className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground">Prix extra (€)</label>
                          <input
                            type="number" min="0" step="0.01"
                            value={group.group_price ?? ""}
                            placeholder="Item price"
                            onChange={(e) => updateGroupMut.mutate({
                              id: group.id,
                              updates: { group_price: e.target.value ? parseFloat(e.target.value) : null },
                            })}
                            className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                          />
                        </div>
                      </div>

                      {/* Options list — only show for non-linked groups */}
                      {!isLinked && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">Options</p>
                          {group.options.map((opt) => (
                            <div key={opt.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
                              <span className="text-xs font-medium text-foreground">{opt.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {Number(opt.price_supplement) > 0 ? `+${Number(opt.price_supplement).toFixed(2)} €` : "Gratuit"}
                                </span>
                                <button onClick={() => deleteOptionMut.mutate(opt.id)} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {/* Add option */}
                          {addingOptionGroupId === group.id ? (
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                autoFocus value={newOptionName}
                                onChange={(e) => setNewOptionName(e.target.value)}
                                placeholder="Nom"
                                className="flex-1 rounded border bg-background px-2 py-1.5 text-xs"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && newOptionName.trim()) {
                                    createOptionMut.mutate({ groupId: group.id, name: newOptionName.trim(), price: parseFloat(newOptionPrice) || 0 });
                                  }
                                  if (e.key === "Escape") setAddingOptionGroupId(null);
                                }}
                              />
                              <input
                                value={newOptionPrice} onChange={(e) => setNewOptionPrice(e.target.value)}
                                placeholder="€" type="number" step="0.01" min="0"
                                className="w-16 rounded border bg-background px-2 py-1.5 text-xs"
                              />
                              <button
                                onClick={() => newOptionName.trim() && createOptionMut.mutate({ groupId: group.id, name: newOptionName.trim(), price: parseFloat(newOptionPrice) || 0 })}
                                className="text-success"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={() => setAddingOptionGroupId(null)} className="text-muted-foreground">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAddingOptionGroupId(group.id); setNewOptionName(""); setNewOptionPrice(""); }}
                              className="flex items-center gap-1 text-xs text-primary font-medium mt-1"
                            >
                              <Plus className="h-3 w-3" /> Ajouter une option
                            </button>
                          )}
                        </div>
                      )}

                      {/* Delete group */}
                      <button
                        onClick={() => { if (confirm("Supprimer ce groupe et toutes ses options ?")) deleteGroupMut.mutate(group.id); }}
                        className="flex items-center gap-1 text-xs text-destructive font-medium"
                      >
                        <Trash2 className="h-3 w-3" /> Supprimer le groupe
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* New group */}
          {showNewGroup ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Nom du groupe (ex: Sauces, Crudités...)"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroupName.trim()) createGroupMut.mutate(newGroupName.trim());
                  if (e.key === "Escape") setShowNewGroup(false);
                }}
              />
              <button onClick={() => newGroupName.trim() && createGroupMut.mutate(newGroupName.trim())} className="text-success"><Check className="h-5 w-5" /></button>
              <button onClick={() => setShowNewGroup(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewGroup(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border py-3 text-xs font-semibold text-primary hover:border-primary/40"
            >
              <Plus className="h-4 w-4" /> Ajouter un groupe d'options
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OptionGroupConfigurator;
