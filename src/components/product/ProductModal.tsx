import { X, Minus, Plus, Loader2, Check, ChevronRight, ChevronLeft, UtensilsCrossed, AlertTriangle } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useProductConfigurator } from "@/hooks/useProductConfigurator";
import { useCart } from "@/contexts/useCart";
import type { CartItemOption } from "@/services/cartService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";

interface ProductModalProps {
  product: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    image_url?: string | null;
    menu_supplement?: number | null;
    menu_label?: string | null;
  } | null;
  restaurantId: string;
  open: boolean;
  onClose: () => void;
  editCartItemId?: string | null;
  editInitialOptions?: CartItemOption[];
  editInitialQuantity?: number;
  onSelectItem?: (item: Omit<import("@/contexts/CartContext").CartItem, "id">) => void;
}

const ProductModal = ({ product, restaurantId, open, onClose, editCartItemId, editInitialOptions, editInitialQuantity, onSelectItem }: ProductModalProps) => {
  const [quantity, setQuantity] = useState(editInitialQuantity || 1);
  const [currentStep, setCurrentStep] = useState(0);
  const { addItem, updateItem, currentRestaurantId, clearCart, items } = useCart();
  const isEditMode = !!editCartItemId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const pendingItemRef = useRef<Omit<import("@/contexts/CartContext").CartItem, "id"> | null>(null);

  const {
    optionGroups,
    isLoading,
    selectedOptionIds,
    selectedOptions,
    toggleOption,
    resetSelection,
    setSelectedOptionIds,
    finalPrice,
    allRequiredSelected,
    getGroupSelectionCount,
    getGroupRemaining,
    isOptionFree,
    hasMenuFormula,
    isMenuSelected,
    toggleMenu,
  } = useProductConfigurator(product?.id ?? null, Number(product?.price ?? 0), product?.menu_supplement);

  // Wizard: step 0 = menu choice (if has formula), then option groups
  const menuStepOffset = hasMenuFormula ? 1 : 0;
  const totalSteps = optionGroups.length + menuStepOffset;
  const useWizard = totalSteps > 1;

  const isMenuStep = hasMenuFormula && currentStep === 0;
  const groupStepIndex = currentStep - menuStepOffset;
  const currentGroup = !isMenuStep && groupStepIndex >= 0 && groupStepIndex < optionGroups.length
    ? optionGroups[groupStepIndex]
    : null;

  useEffect(() => {
    if (open) {
      setQuantity(editInitialQuantity || 1);
      setCurrentStep(0);
      resetSelection();
    }
  }, [open, resetSelection, editInitialQuantity]);

  // Scroll to top when step changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // Pre-select options in edit mode
  useEffect(() => {
    if (open && isEditMode && editInitialOptions && editInitialOptions.length > 0 && optionGroups.length > 0) {
      const allOpts = optionGroups.flatMap((g) => g.options);
      const idsToSelect = new Set<string>();
      for (const editOpt of editInitialOptions) {
        const match = allOpts.find((o) => o.name === editOpt.name);
        if (match) idsToSelect.add(match.id);
      }
      if (idsToSelect.size > 0) setSelectedOptionIds(idsToSelect);
    }
  }, [open, isEditMode, editInitialOptions, optionGroups, setSelectedOptionIds]);

  if (!product) return null;

  const canGoNext = () => {
    if (isMenuStep) return true; // Menu choice is always optional
    if (!currentGroup) return true;
    if (currentGroup.is_required) {
      const count = getGroupSelectionCount(currentGroup.id);
      const min = Math.max(currentGroup.min_selections, 1);
      return count >= min;
    }
    return true;
  };

  const isLastStep = currentStep >= totalSteps - 1;

  const buildItemData = () => {
    const opts: CartItemOption[] = selectedOptions.map((o) => ({
      name: o.name,
      price: Number(o.price_supplement),
    }));
    if (isMenuSelected && hasMenuFormula) {
      opts.push({
        name: product.menu_label || "Menu",
        price: product.menu_supplement!,
      });
    }
    return {
      restaurant_id: restaurantId,
      product_id: product.id,
      product_name: product.name,
      options: opts,
      unit_price: finalPrice,
      quantity,
    };
  };

  const doAddItem = (itemData: Omit<import("@/contexts/CartContext").CartItem, "id">) => {
    if (onSelectItem) {
      onSelectItem(itemData);
    } else if (isEditMode && editCartItemId) {
      updateItem(editCartItemId, itemData);
    } else {
      addItem(itemData);
    }
    onClose();
  };

  const handleAdd = () => {
    if (!allRequiredSelected) return;
    const itemData = buildItemData();

    // Check if switching restaurant and cart has items
    const isDifferentRestaurant = !onSelectItem && currentRestaurantId && currentRestaurantId !== restaurantId;
    if (isDifferentRestaurant && items.length > 0 && !isEditMode) {
      pendingItemRef.current = itemData;
      setShowSwitchDialog(true);
      return;
    }

    doAddItem(itemData);
  };

  const handleConfirmSwitch = () => {
    setShowSwitchDialog(false);
    if (pendingItemRef.current) {
      clearCart();
      // Small delay to let clear propagate
      setTimeout(() => {
        if (pendingItemRef.current) {
          addItem(pendingItemRef.current);
          pendingItemRef.current = null;
          onClose();
        }
      }, 100);
    }
  };

  const canAdd = allRequiredSelected;

  const renderGroup = (group: typeof optionGroups[0]) => {
    const isSingleSelect = group.selection_type === "single" || group.max_selections === 1;
    const hasSelection = group.options.some((o) => selectedOptionIds.has(o.id));
    const selectedCount = getGroupSelectionCount(group.id);
    const remaining = getGroupRemaining(group.id);

    return (
      <div key={group.id} className="bg-secondary/50">
        {/* Group header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div>
            <h3 className="text-base font-bold text-foreground">{group.name}</h3>
            <p className="text-xs text-muted-foreground">
              {isSingleSelect
                ? "Choisissez 1"
                : group.min_selections > 0
                  ? `Min. ${group.min_selections} — Max. ${group.max_selections}`
                  : `Max. ${group.max_selections}`}
              {group.free_count > 0 && group.pricing_mode !== "pair" && (
                <span className="ml-1 text-success font-semibold">
                  · {group.free_count} gratuit{group.free_count > 1 ? "s" : ""}
                </span>
              )}
            </p>
            {group.pricing_mode === "pair" && group.group_price != null && (
              <p className="text-xs font-semibold text-primary mt-0.5">
                {Array.from({ length: Math.ceil(group.max_selections / 2) }, (_, i) => {
                  const from = i * 2 + 1;
                  const to = Math.min(i * 2 + 2, group.max_selections);
                  const price = (i + 1) * group.group_price!;
                  return `${price.toFixed(0)}€ / ${from}${to > from ? `-${to}` : ""}`;
                }).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isSingleSelect && selectedCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                {selectedCount}/{group.max_selections}
              </span>
            )}
            {group.is_required ? (
              hasSelection ? (
                <Check className="h-5 w-5 text-success" />
              ) : (
                <span className="rounded bg-foreground px-2 py-0.5 text-[11px] font-bold text-background">
                  Requis
                </span>
              )
            ) : (
              <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                Optionnel
              </span>
            )}
          </div>
        </div>
        {/* Options */}
        <div className="space-y-0">
          {group.options.map((opt) => {
            const selected = selectedOptionIds.has(opt.id);
            const isFree = isOptionFree(opt.id, group.id);
            const effectivePrice =
              group.group_price != null ? group.group_price : Number(opt.price_supplement);
            const showPrice = effectivePrice !== 0 && !isFree && group.pricing_mode !== "pair";

            return (
              <button
                key={opt.id}
                onClick={() => toggleOption(opt.id, group.id)}
                disabled={!selected && remaining <= 0 && !isSingleSelect}
                className={`flex w-full items-center justify-between border-b border-border bg-card px-5 py-3.5 text-left last:border-b-0 transition-opacity ${
                  !selected && remaining <= 0 && !isSingleSelect ? "opacity-40" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {isSingleSelect ? (
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                        selected ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}
                    >
                      {selected && <div className="h-2 w-2 rounded-full bg-primary-foreground" />}
                    </div>
                  ) : (
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                        selected ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}
                    >
                      {selected && (
                        <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}
                  <span className="text-sm font-semibold text-foreground">{opt.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isFree && (
                    <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
                      GRATUIT
                    </span>
                  )}
                  {showPrice && (
                    <span className={`text-sm font-medium ${effectivePrice < 0 ? "text-success" : "text-muted-foreground"}`}>
                      {effectivePrice < 0 ? `−${Math.abs(effectivePrice).toFixed(2)} €` : `+€ ${effectivePrice.toFixed(2)}`}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMenuStep = () => (
    <div className="bg-secondary/50">
      <div className="px-5 py-3">
        <h3 className="text-base font-bold text-foreground">Formule Menu</h3>
        <p className="text-xs text-muted-foreground">Optionnel</p>
      </div>
      <button
        onClick={toggleMenu}
        className="flex w-full items-center justify-between border-b border-border bg-card px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
              isMenuSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
            }`}
          >
            {isMenuSelected && (
              <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">
                Menu {product.name}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Frites + Sauce + Boisson
            </p>
          </div>
        </div>
        <span className="text-sm font-semibold text-primary">
          € {(Number(product.price) + Number(product.menu_supplement)).toFixed(2)}
        </span>
      </button>
    </div>
  );

  return (
    <>
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} dismissible={false}>
      <DrawerContent className="max-h-[90vh]">
        {/* Header */}
        <DrawerHeader className="relative border-b border-border px-5 pb-3 pt-2">
          <DrawerTitle className="text-center text-base font-bold text-foreground">
            {product.name}
          </DrawerTitle>
          {useWizard && (
            <p className="text-center text-xs text-muted-foreground">
              Étape {currentStep + 1} / {totalSteps}
            </p>
          )}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="absolute right-3 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:bg-muted z-50 touch-manipulation"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </DrawerHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {/* Product image + info (step 0 or no wizard) */}
          {(!useWizard || currentStep === 0) && (
            <>
              {product.image_url && (
                <div className="px-5 pt-4">
                  <img src={product.image_url} alt={product.name} className="w-full rounded-xl object-cover max-h-56" />
                </div>
              )}
              <div className="px-5 py-4 space-y-1">
                <h2 className="text-lg font-extrabold text-foreground">{product.name}</h2>
                <p className="text-base font-bold text-foreground">€ {Number(product.price).toFixed(2)}</p>
                {product.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
                )}
              </div>
            </>
          )}

          {/* Content based on current step */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : useWizard ? (
            isMenuStep ? renderMenuStep() : currentGroup ? renderGroup(currentGroup) : null
          ) : optionGroups.length > 0 ? (
            <>
              {hasMenuFormula && renderMenuStep()}
              <div className="space-y-0">{optionGroups.map(renderGroup)}</div>
            </>
          ) : hasMenuFormula ? (
            renderMenuStep()
          ) : null}
        </div>

        {/* Progress dots for wizard */}
        {useWizard && totalSteps > 1 && (
          <div className="flex justify-center gap-1.5 py-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep ? "w-6 bg-primary" : i < currentStep ? "w-1.5 bg-primary/40" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>
        )}

        {/* Bottom bar */}
        <div className="border-t border-border px-5 py-4">
          {useWizard ? (
            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {isLastStep ? (
                <>
                  <div className="flex items-center rounded-full border border-border bg-secondary">
                    <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center text-foreground">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-foreground">{quantity}</span>
                    <button onClick={() => setQuantity((q) => q + 1)} className="flex h-10 w-10 items-center justify-center text-foreground">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={handleAdd}
                    disabled={!canAdd || !canGoNext()}
                    className="flex flex-1 items-center justify-between rounded-full bg-primary px-6 py-3 shadow-float transition-transform active:scale-[0.98] disabled:opacity-40"
                  >
                    <span className="text-sm font-bold text-primary-foreground">{isEditMode ? "Modifier" : "Ajouter"}</span>
                    <span className="text-sm font-bold text-primary-foreground">€ {(finalPrice * quantity).toFixed(2)}</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setCurrentStep((s) => s + 1)}
                  disabled={!canGoNext()}
                  className="flex flex-1 items-center justify-between rounded-full bg-primary px-6 py-3 shadow-float transition-transform active:scale-[0.98] disabled:opacity-40"
                >
                  <span className="text-sm font-bold text-primary-foreground">Suivant</span>
                  <ChevronRight className="h-5 w-5 text-primary-foreground" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex items-center rounded-full border border-border bg-secondary">
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center text-foreground">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center text-sm font-bold text-foreground">{quantity}</span>
                <button onClick={() => setQuantity((q) => q + 1)} className="flex h-10 w-10 items-center justify-center text-foreground">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={handleAdd}
                disabled={!canAdd}
                className="flex flex-1 items-center justify-between rounded-full bg-primary px-6 py-3 shadow-float transition-transform active:scale-[0.98] disabled:opacity-40"
              >
                <span className="text-sm font-bold text-primary-foreground">{isEditMode ? "Modifier" : "Ajouter"}</span>
                <span className="text-sm font-bold text-primary-foreground">€ {(finalPrice * quantity).toFixed(2)}</span>
              </button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>

    <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Changer de restaurant ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Votre panier contient des articles d'un autre restaurant. En continuant, votre panier actuel sera vidé et remplacé par ce nouvel article.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setShowSwitchDialog(false); pendingItemRef.current = null; }}>
            Annuler
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmSwitch} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Vider et continuer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default ProductModal;
