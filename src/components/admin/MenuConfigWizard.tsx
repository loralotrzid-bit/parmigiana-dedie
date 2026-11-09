import { useState, lazy, Suspense } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Copy, Eye, EyeOff, ImageIcon, Pencil, Plus, Upload, X, Loader2, Settings2 } from "lucide-react";
import { safeToast } from "@/lib/safeToast";
import { createCategory, createProduct, updateProduct, cloneOptionGroupsToProducts } from "@/services/adminMenuService";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

const OptionGroupConfigurator = lazy(() => import("@/components/admin/OptionGroupConfigurator"));

interface Category {
  id: string;
  name: string;
  is_published: boolean;
  products: Product[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  image_url?: string | null;
  is_published: boolean;
  menu_supplement: number | null;
  menu_label: string | null;
}

interface Props {
  restaurantId: string;
  categories: Category[];
  onClose: () => void;
  onInvalidate: () => void;
}

type WizardMode = "choose" | "adapt" | "add";
type AdaptStep = "pick-category" | "review-product";
type AddStep = "pick-category" | "new-category" | "new-product";

const MenuConfigWizard = ({ restaurantId, categories, onClose, onInvalidate }: Props) => {
  const [mode, setMode] = useState<WizardMode>("choose");

  // ── Adapt flow state ──
  const [adaptStep, setAdaptStep] = useState<AdaptStep>("pick-category");
  const [selectedCatIdx, setSelectedCatIdx] = useState(0);
  const [productIdx, setProductIdx] = useState(0);
  const [editFields, setEditFields] = useState<{ name: string; price: string; is_published: boolean; menu_supplement: string; menu_label: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showOptionConfig, setShowOptionConfig] = useState<string | null>(null);
  const [showBulkApply, setShowBulkApply] = useState(false);
  const [bulkExcludes, setBulkExcludes] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);

  // ── Add flow state ──
  const [addStep, setAddStep] = useState<AddStep>("pick-category");
  const [addCatId, setAddCatId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newProduct, setNewProduct] = useState({ name: "", price: "", description: "" });
  const [creatingCat, setCreatingCat] = useState(false);
  const [creatingProd, setCreatingProd] = useState(false);

  // ── Helpers ──
  const currentCat = categories[selectedCatIdx];
  const currentProducts = currentCat?.products || [];
  const currentProduct = currentProducts[productIdx];

  const initEditFields = (p: Product) => {
    setEditFields({ name: p.name, price: String(p.price), is_published: p.is_published, menu_supplement: String(p.menu_supplement ?? ""), menu_label: p.menu_label ?? "" });
  };

  const startCategory = (catIdx: number) => {
    setSelectedCatIdx(catIdx);
    setProductIdx(0);
    const prods = categories[catIdx]?.products || [];
    if (prods.length > 0) {
      initEditFields(prods[0]);
      setAdaptStep("review-product");
    } else {
      safeToast.info("Cette catégorie est vide");
    }
  };

  const handleSaveProduct = async () => {
    if (!editFields || !currentProduct) return;
    setSaving(true);
    try {
      const updates: Pick<TablesUpdate<"products">, "name" | "price" | "is_published" | "menu_supplement" | "menu_label"> = {};
      if (editFields.name !== currentProduct.name) updates.name = editFields.name;
      if (parseFloat(editFields.price) !== currentProduct.price) updates.price = parseFloat(editFields.price);
      if (editFields.is_published !== currentProduct.is_published) updates.is_published = editFields.is_published;
      const newSup = editFields.menu_supplement ? parseFloat(editFields.menu_supplement) : null;
      if (newSup !== (currentProduct.menu_supplement ?? null)) updates.menu_supplement = newSup;
      const newLabel = editFields.menu_label.trim() || null;
      if (newLabel !== (currentProduct.menu_label ?? null)) updates.menu_label = newLabel;
      if (Object.keys(updates).length > 0) {
        await updateProduct(currentProduct.id, updates);
        onInvalidate();
        safeToast.success("Produit mis à jour");
      }
    } catch (error: unknown) {
      safeToast.error(error instanceof Error ? error.message : "Erreur lors de la mise à jour du produit");
    } finally {
      setSaving(false);
    }
  };

  const goNextProduct = async () => {
    await handleSaveProduct();
    if (productIdx < currentProducts.length - 1) {
      const next = productIdx + 1;
      setProductIdx(next);
      initEditFields(currentProducts[next]);
    } else {
      // Category done — ask to continue or finish
      setAdaptStep("pick-category");
    }
  };

  const goPrevProduct = async () => {
    if (productIdx > 0) {
      await handleSaveProduct();
      const prev = productIdx - 1;
      setProductIdx(prev);
      initEditFields(currentProducts[prev]);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProduct) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${restaurantId}/products/${currentProduct.id}.${ext}`;
    const { error } = await supabase.storage.from("restaurant-images").upload(path, file, { upsert: true });
    if (error) { safeToast.error("Erreur upload"); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("restaurant-images").getPublicUrl(path);
    await updateProduct(currentProduct.id, { image_url: urlData.publicUrl });
    onInvalidate();
    setUploading(false);
    safeToast.success("Image uploadée");
  };

  const handleCreateProduct = async () => {
    const catId = addCatId;
    if (!catId || !newProduct.name.trim() || !newProduct.price) return;
    setCreatingProd(true);
    try {
      await createProduct(catId, {
        name: newProduct.name.trim(),
        price: parseFloat(newProduct.price),
        description: newProduct.description.trim() || undefined,
      });
      onInvalidate();
      safeToast.success("Produit créé");
      onClose();
    } catch (error: unknown) {
      safeToast.error(error instanceof Error ? error.message : "Erreur lors de la création du produit");
    } finally {
      setCreatingProd(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    try {
      const cat = await createCategory(restaurantId, newCatName.trim(), (categories.length || 0) + 1);
      onInvalidate();
      setAddCatId(cat.id);
      setAddStep("new-product");
      safeToast.success("Catégorie créée");
    } catch (error: unknown) {
      safeToast.error(error instanceof Error ? error.message : "Erreur lors de la création de la catégorie");
    } finally {
      setCreatingCat(false);
    }
  };

  // ── Render ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-elevated overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-bold text-card-foreground">
            {mode === "choose" && "Configurer le menu"}
            {mode === "adapt" && "Adapter le menu"}
            {mode === "add" && "Ajouter un article"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {/* ── Choose mode ── */}
          {mode === "choose" && (
            <div className="space-y-3">
              <button
                onClick={() => { setMode("adapt"); setAdaptStep("pick-category"); }}
                className="flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-bold text-foreground">Adapter le menu existant</p>
                  <p className="text-xs text-muted-foreground">Revoir et modifier les articles catégorie par catégorie</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => { setMode("add"); setAddStep("pick-category"); }}
                className="flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-bold text-foreground">Ajouter un nouvel article</p>
                  <p className="text-xs text-muted-foreground">Créer un produit dans une catégorie existante ou nouvelle</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* ── Adapt flow ── */}
          {mode === "adapt" && adaptStep === "pick-category" && (
            <div className="space-y-2">
              <button onClick={() => setMode("choose")} className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" /> Retour
              </button>
              <p className="text-xs text-muted-foreground mb-2">Sélectionnez une catégorie à revoir :</p>
              {categories.map((cat, idx) => (
                <button
                  key={cat.id}
                  onClick={() => startCategory(idx)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent ${
                    selectedCatIdx === idx && adaptStep !== "pick-category" ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">({cat.products.length})</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
              <div className="pt-3 border-t">
                <button onClick={onClose} className="w-full rounded-lg bg-muted py-2.5 text-xs font-semibold text-muted-foreground">
                  Terminer
                </button>
              </div>
            </div>
          )}

          {mode === "adapt" && adaptStep === "review-product" && currentProduct && editFields && (
            <div className="space-y-4">
              <button onClick={() => setAdaptStep("pick-category")} className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" /> {currentCat.name}
              </button>

              {/* Progress */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary">
                  Article {productIdx + 1} / {currentProducts.length}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${((productIdx + 1) / currentProducts.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Product image */}
              <div className="flex justify-center">
                {currentProduct.image_url ? (
                  <div className="relative">
                    <img src={currentProduct.image_url} alt="" className="h-28 w-28 rounded-xl object-cover border" />
                    <label className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer shadow">
                      {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                    </label>
                  </div>
                ) : (
                  <label className="flex h-28 w-28 flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 transition-colors">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                        <span className="text-[10px] text-muted-foreground">Photo</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                  </label>
                )}
              </div>

              {/* Fields */}
              <div className="space-y-2">
                <input
                  value={editFields.name}
                  onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                  placeholder="Nom du produit"
                />
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      value={editFields.price}
                      onChange={(e) => setEditFields({ ...editFields, price: e.target.value })}
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      placeholder="Prix"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                  </div>
                  <button
                    onClick={() => setEditFields({ ...editFields, is_published: !editFields.is_published })}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      editFields.is_published ? "border-success/30 bg-success/5 text-success" : "text-muted-foreground"
                    }`}
                  >
                    {editFields.is_published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {editFields.is_published ? "Publié" : "Masqué"}
                  </button>
                </div>
              </div>

              {/* Menu formula */}
              <div className="space-y-2 rounded-lg border border-dashed border-primary/20 bg-primary/5 p-3">
                <p className="text-[10px] font-bold text-primary uppercase">Formule Menu (optionnel)</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      value={editFields.menu_supplement}
                      onChange={(e) => setEditFields({ ...editFields, menu_supplement: e.target.value })}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Supplément"
                      className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">€</span>
                  </div>
                  <input
                    value={editFields.menu_label}
                    onChange={(e) => setEditFields({ ...editFields, menu_label: e.target.value })}
                    placeholder="Label (ex: Menu Frites+Boisson)"
                    className="flex-[2] rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Option groups button */}
              <button
                onClick={() => setShowOptionConfig(currentProduct.id)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Groupes d'options (sauces, extras…)
              </button>

              {/* Bulk apply to category */}
              {currentProducts.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      setBulkExcludes(new Set());
                      setShowBulkApply(!showBulkApply);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-muted-foreground/20 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Appliquer les options à toute la catégorie
                  </button>

                  {showBulkApply && (
                    <div className="space-y-2 rounded-lg border bg-secondary/30 p-3">
                      <p className="text-[10px] font-bold text-foreground">
                        Copier les groupes d'options de « {currentProduct.name} » vers :
                      </p>
                      {currentProducts.filter(p => p.id !== currentProduct.id).map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={!bulkExcludes.has(p.id)}
                            onChange={() => {
                              const next = new Set(bulkExcludes);
                              if (next.has(p.id)) next.delete(p.id);
                              else next.add(p.id);
                              setBulkExcludes(next);
                            }}
                            className="rounded"
                          />
                          <span className={`font-medium ${bulkExcludes.has(p.id) ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {p.name}
                          </span>
                        </label>
                      ))}
                      <button
                        disabled={bulkApplying || currentProducts.filter(p => p.id !== currentProduct.id && !bulkExcludes.has(p.id)).length === 0}
                        onClick={async () => {
                          const targets = currentProducts
                            .filter(p => p.id !== currentProduct.id && !bulkExcludes.has(p.id))
                            .map(p => p.id);
                          setBulkApplying(true);
                          try {
                            await cloneOptionGroupsToProducts(currentProduct.id, targets);
                            onInvalidate();
                            safeToast.success(`Options appliquées à ${targets.length} produit${targets.length > 1 ? "s" : ""}`);
                            setShowBulkApply(false);
                          } catch (error: unknown) {
                            safeToast.error(error instanceof Error ? error.message : "Erreur lors de la copie des options");
                          } finally {
                            setBulkApplying(false);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                      >
                        {bulkApplying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Appliquer
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Navigation */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={goPrevProduct}
                  disabled={productIdx === 0 || saving}
                  className="flex items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-semibold text-muted-foreground disabled:opacity-30"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Précédent
                </button>
                <button
                  onClick={goNextProduct}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  {productIdx < currentProducts.length - 1 ? (
                    <>Suivant <ArrowRight className="h-3.5 w-3.5" /></>
                  ) : (
                    <>Terminer la catégorie <Check className="h-3.5 w-3.5" /></>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Add flow ── */}
          {mode === "add" && addStep === "pick-category" && (
            <div className="space-y-2">
              <button onClick={() => setMode("choose")} className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" /> Retour
              </button>
              <p className="text-xs text-muted-foreground mb-2">Dans quelle catégorie ?</p>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setAddCatId(cat.id); setAddStep("new-product"); }}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="text-sm font-semibold text-foreground">{cat.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
              <button
                onClick={() => setAddStep("new-category")}
                className="flex w-full items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Nouvelle catégorie
              </button>
            </div>
          )}

          {mode === "add" && addStep === "new-category" && (
            <div className="space-y-3">
              <button onClick={() => setAddStep("pick-category")} className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" /> Retour
              </button>
              <p className="text-xs text-muted-foreground">Nom de la nouvelle catégorie :</p>
              <input
                autoFocus
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
                placeholder="Ex: Desserts, Boissons…"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={handleCreateCategory}
                disabled={!newCatName.trim() || creatingCat}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {creatingCat && <Loader2 className="h-3 w-3 animate-spin" />}
                Créer et continuer <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {mode === "add" && addStep === "new-product" && (
            <div className="space-y-3">
              <button onClick={() => { setAddStep("pick-category"); setAddCatId(null); }} className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" /> Retour
              </button>
              <p className="text-xs text-muted-foreground">Nouveau produit :</p>
              <input
                autoFocus
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="Nom du produit"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <div className="relative">
                <input
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Prix"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
              <input
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                placeholder="Description (optionnel)"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={handleCreateProduct}
                disabled={!newProduct.name.trim() || !newProduct.price || creatingProd}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {creatingProd && <Loader2 className="h-3 w-3 animate-spin" />}
                Créer le produit <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Option group configurator overlay */}
        {showOptionConfig && (
          <Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <OptionGroupConfigurator
              productId={showOptionConfig}
              productName={currentProduct?.name || ""}
              restaurantId={restaurantId}
              onClose={() => { setShowOptionConfig(null); onInvalidate(); }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default MenuConfigWizard;
