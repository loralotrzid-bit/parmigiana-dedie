import { Plus, GripVertical, Eye, EyeOff, Pencil, Loader2, Trash2, Check, X, Upload, ImageIcon, Star, Settings2, LogIn } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMenuByRestaurantId } from "@/services/menuService";
import { createCategory, updateCategory, deleteCategory, createProduct, updateProduct, deleteProduct } from "@/services/adminMenuService";
import { useAuth } from "@/contexts/useAuth";
import AdminLayout from "@/layouts/AdminLayout";
import { useState, lazy, Suspense } from "react";
import { safeToast } from "@/lib/safeToast";
import { supabase } from "@/integrations/supabase/client";

const OptionGroupConfigurator = lazy(() => import("@/components/admin/OptionGroupConfigurator"));
const MenuConfigWizard = lazy(() => import("@/components/admin/MenuConfigWizard"));

// ─── Inline form for creating / editing ──────────────────

interface InlineFormProps {
  initial?: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

const InlineForm = ({ initial = "", placeholder, onSubmit, onCancel }: InlineFormProps) => {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <button onClick={() => value.trim() && onSubmit(value.trim())} className="text-success"><Check className="h-4 w-4" /></button>
      <button onClick={onCancel} className="text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
};

// ─── Product inline form ─────────────────────────────────

interface ProductFormProps {
  initial?: { name: string; price: string; description: string; menu_supplement: string; menu_label: string };
  onSubmit: (data: { name: string; price: number; description: string; menu_supplement?: number | null; menu_label?: string | null }) => void;
  onCancel: () => void;
}

const ProductForm = ({ initial, onSubmit, onCancel }: ProductFormProps) => {
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial?.price || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [menuSupplement, setMenuSupplement] = useState(initial?.menu_supplement || "");
  const [menuLabel, setMenuLabel] = useState(initial?.menu_label || "");

  const handleSubmit = () => {
    if (!name.trim() || !price) return;
    onSubmit({
      name: name.trim(),
      price: parseFloat(price),
      description: description.trim(),
      menu_supplement: menuSupplement ? parseFloat(menuSupplement) : null,
      menu_label: menuLabel.trim() || null,
    });
  };

  return (
    <div className="space-y-2 border-t px-3 py-3">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du produit" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      <div className="flex gap-2">
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Prix (€)" type="number" step="0.01" min="0" className="w-28 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optionnel)" className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      </div>
      <div className="flex gap-2">
        <input value={menuSupplement} onChange={(e) => setMenuSupplement(e.target.value)} placeholder="Supplément Menu (€)" type="number" step="0.01" min="0" className="w-40 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        <input value={menuLabel} onChange={(e) => setMenuLabel(e.target.value)} placeholder="Label menu (ex: Frites + Sauce + Boisson)" className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary">Annuler</button>
        <button onClick={handleSubmit} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Enregistrer</button>
      </div>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────

const MenuManager = () => {
  const { restaurantId, isSuperAdmin, impersonateRestaurant } = useAuth();
  const queryClient = useQueryClient();
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);
  const [configuringProduct, setConfiguringProduct] = useState<{ id: string; name: string } | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  // Super admin: fetch all restaurants for selector when no restaurantId
  const { data: allRestaurants } = useQuery({
    queryKey: ["all-restaurants-selector"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id, name, slug").order("name");
      return data || [];
    },
    enabled: isSuperAdmin && !restaurantId,
  });

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, productId: string) => {
    const file = e.target.files?.[0];
    if (!file || !restaurantId) return;
    setUploadingProductId(productId);
    const ext = file.name.split(".").pop();
    const path = `${restaurantId}/products/${productId}.${ext}`;
    const { error } = await supabase.storage.from("restaurant-images").upload(path, file, { upsert: true });
    if (error) {
      safeToast.error("Erreur upload image");
      setUploadingProductId(null);
      return;
    }
    const { data: urlData } = supabase.storage.from("restaurant-images").getPublicUrl(path);
    await updateProduct(productId, { image_url: urlData.publicUrl });
    queryClient.invalidateQueries({ queryKey: ["admin-menu", restaurantId] });
    setUploadingProductId(null);
    safeToast.success("Image produit uploadée");
  };

  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [newProductCategoryId, setNewProductCategoryId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["admin-menu", restaurantId],
    queryFn: () => fetchMenuByRestaurantId(restaurantId!, false),
    enabled: !!restaurantId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-menu", restaurantId] });

  // ─── Mutations ───────────────────────────────────────

  const createCatMut = useMutation({
    mutationFn: (name: string) => createCategory(restaurantId!, name, (categories?.length || 0) + 1),
    onSuccess: () => { invalidate(); setNewCategoryMode(false); safeToast.success("Catégorie créée"); },
    onError: (error) => safeToast.error(error.message),
  });

  const updateCatMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateCategory>[1] }) => updateCategory(id, updates),
    onSuccess: () => { invalidate(); setEditingCategoryId(null); safeToast.success("Catégorie mise à jour"); },
    onError: (error) => safeToast.error(error.message),
  });

  const deleteCatMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => { invalidate(); safeToast.success("Catégorie supprimée"); },
    onError: (error) => safeToast.error(error.message),
  });

  const createProdMut = useMutation({
    mutationFn: ({ categoryId, data }: { categoryId: string; data: Parameters<typeof createProduct>[1] }) => createProduct(categoryId, data),
    onSuccess: () => { invalidate(); setNewProductCategoryId(null); safeToast.success("Produit créé"); },
    onError: (error) => safeToast.error(error.message),
  });

  const updateProdMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateProduct>[1] }) => updateProduct(id, updates),
    onSuccess: () => { invalidate(); setEditingProductId(null); safeToast.success("Produit mis à jour"); },
    onError: (error) => safeToast.error(error.message),
  });

  const deleteProdMut = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => { invalidate(); safeToast.success("Produit supprimé"); },
    onError: (error) => safeToast.error(error.message),
  });

  // Super admin without impersonation: show restaurant selector
  if (!restaurantId && isSuperAdmin) {
    return (
      <AdminLayout>
        <div className="animate-fade-in px-4 pt-4 pb-20">
          <h1 className="text-xl font-extrabold text-foreground mb-4">Menu</h1>
          <div className="rounded-xl border bg-card p-6 shadow-card space-y-4">
            <p className="text-sm text-muted-foreground">Sélectionne un restaurant pour gérer son menu :</p>
            <div className="space-y-2">
              {allRestaurants?.map((r) => (
                <button
                  key={r.id}
                  onClick={() => impersonateRestaurant(r.id)}
                  className="w-full flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-left hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">{r.name}</p>
                    <p className="text-xs font-mono text-primary">{r.slug}</p>
                  </div>
                  <LogIn className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="animate-fade-in px-4 pt-4 pb-20">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-foreground">Menu</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configurer
            </button>
            <button
              onClick={() => setNewCategoryMode(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Catégorie
            </button>
          </div>
        </div>

        {/* New category form */}
        {newCategoryMode && (
          <div className="mb-4 rounded-xl border bg-card shadow-card">
            <InlineForm
              placeholder="Nom de la catégorie"
              onSubmit={(name) => createCatMut.mutate(name)}
              onCancel={() => setNewCategoryMode(false)}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Aucune catégorie. Créez-en une pour commencer.
          </div>
        ) : (
          <div className="space-y-4">
            {categories.map((cat) => (
              <div key={cat.id} className="rounded-xl border bg-card shadow-card">
                {/* Category header */}
                <div className="flex items-center justify-between border-b px-3 py-3">
                  {editingCategoryId === cat.id ? (
                    <InlineForm
                      initial={cat.name}
                      placeholder="Nom de la catégorie"
                      onSubmit={(name) => updateCatMut.mutate({ id: cat.id, updates: { name } })}
                      onCancel={() => setEditingCategoryId(null)}
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-bold text-card-foreground">{cat.name}</h2>
                        <span className="text-xs text-muted-foreground">({cat.products.length})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCatMut.mutate({ id: cat.id, updates: { is_visible_to_client: !cat.is_visible_to_client } })}
                          className="flex items-center gap-1 text-[10px] font-medium"
                          title={cat.is_visible_to_client ? "Visible au client — cliquez pour masquer" : "Masqué du menu client — cliquez pour afficher"}
                        >
                          {cat.is_visible_to_client ? (
                            <span className="flex items-center gap-0.5 rounded bg-success/10 px-1.5 py-0.5 text-success">Menu</span>
                          ) : (
                            <span className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Caché</span>
                          )}
                        </button>
                        <button
                          onClick={() => updateCatMut.mutate({ id: cat.id, updates: { is_published: !cat.is_published } })}
                          className="flex items-center gap-1 text-xs"
                        >
                          {cat.is_published ? (
                            <span className="flex items-center gap-1 text-success"><Eye className="h-3.5 w-3.5" /> Publié</span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground"><EyeOff className="h-3.5 w-3.5" /> Brouillon</span>
                          )}
                        </button>
                        <button onClick={() => setEditingCategoryId(cat.id)} className="text-muted-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm("Supprimer cette catégorie et tous ses produits ?")) deleteCatMut.mutate(cat.id); }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Products */}
                <div className="divide-y">
                  {cat.products.map((product) => (
                    <div key={product.id}>
                      {editingProductId === product.id ? (
                        <ProductForm
                          initial={{
                            name: product.name,
                            price: String(product.price),
                            description: product.description || "",
                            menu_supplement: product.menu_supplement != null ? String(product.menu_supplement) : "",
                            menu_label: product.menu_label || "",
                          }}
                          onSubmit={(data) => updateProdMut.mutate({ id: product.id, updates: data })}
                          onCancel={() => setEditingProductId(null)}
                        />
                      ) : (
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                            {product.image_url ? (
                              <img src={product.image_url} alt="" className="h-10 w-10 rounded-lg object-cover border" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-card-foreground">{product.name}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold text-primary">{Number(product.price).toFixed(2)} €</p>
                                {product.menu_supplement != null && (
                                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
                                    Menu +{Number(product.menu_supplement).toFixed(2)}€
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setConfiguringProduct({ id: product.id, name: product.name })}
                              title="Configurer les options"
                              className="text-muted-foreground hover:text-primary"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => updateProdMut.mutate({ id: product.id, updates: { is_featured: !product.is_featured } })}
                              title={`${product.is_featured ? 'Retirer des' : 'Ajouter aux'} vedettes`}
                              className={product.is_featured ? "text-warning" : "text-muted-foreground/40 hover:text-warning"}
                            >
                              <Star className={`h-3.5 w-3.5 ${product.is_featured ? 'fill-warning' : ''}`} />
                            </button>
                            <label className="cursor-pointer text-muted-foreground hover:text-primary" title="Upload image">
                              <Upload className="h-3.5 w-3.5" />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleProductImageUpload(e, product.id)} />
                            </label>
                            <button
                              onClick={() => updateProdMut.mutate({ id: product.id, updates: { is_published: !product.is_published } })}
                            >
                              {!product.is_published ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Brouillon</span>
                              ) : (
                                <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">Publié</span>
                              )}
                            </button>
                            <button onClick={() => setEditingProductId(product.id)} className="text-muted-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { if (confirm("Supprimer ce produit ?")) deleteProdMut.mutate(product.id); }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add product */}
                {newProductCategoryId === cat.id ? (
                  <ProductForm
                    onSubmit={(data) => createProdMut.mutate({ categoryId: cat.id, data })}
                    onCancel={() => setNewProductCategoryId(null)}
                  />
                ) : (
                  <button
                    onClick={() => setNewProductCategoryId(cat.id)}
                    className="flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-xs font-medium text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter un produit
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Menu Config Wizard */}
        {showWizard && categories && (
          <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <MenuConfigWizard
              restaurantId={restaurantId!}
              categories={categories}
              onClose={() => setShowWizard(false)}
              onInvalidate={invalidate}
            />
          </Suspense>
        )}

        {configuringProduct && (
          <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <OptionGroupConfigurator
              productId={configuringProduct.id}
              productName={configuringProduct.name}
              restaurantId={restaurantId!}
              onClose={() => setConfiguringProduct(null)}
            />
          </Suspense>
        )}
      </div>
    </AdminLayout>
  );
};

export default MenuManager;
