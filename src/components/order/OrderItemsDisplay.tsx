import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export interface OrderItemData {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  choices?: { option_name: string; price_supplement: number }[];
}

interface OrderItemsDisplayProps {
  items: OrderItemData[];
  defaultExpanded?: boolean;
  compact?: boolean;
  /** Large readable mode for delivery drivers */
  large?: boolean;
}

const OrderItemsDisplay = ({ items, defaultExpanded = true, compact = false, large = false }: OrderItemsDisplayProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!items || items.length === 0) return null;

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  if (large) {
    return (
      <div className="mt-3">
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {totalItems} article{totalItems > 1 ? "s" : ""}
        </button>

        {expanded && (
          <div className="mt-2 space-y-2.5">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <span className="text-base font-extrabold text-foreground leading-snug">
                    {item.quantity}× {item.product_name}
                  </span>
                  {item.choices && item.choices.length > 0 && (
                    <div className="mt-1 ml-1 space-y-0.5">
                      {item.choices.map((c, i) => (
                        <p key={i} className="text-sm text-muted-foreground">
                          └ {c.option_name}
                          {c.price_supplement > 0 && (
                            <span className="ml-1 font-semibold text-primary">+{c.price_supplement.toFixed(2)} €</span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-base font-bold text-foreground whitespace-nowrap">
                  {Number(item.total_price).toFixed(2)} €
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {totalItems} article{totalItems > 1 ? "s" : ""}
      </button>

      {expanded && (
        <div className={`mt-1.5 space-y-1 ${compact ? "text-[11px]" : "text-xs"}`}>
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-foreground">
                  {item.quantity}× {item.product_name}
                </span>
                {item.choices && item.choices.length > 0 && (
                  <div className="ml-4 space-y-0.5">
                    {item.choices.map((c, i) => (
                      <p key={i} className="text-muted-foreground">
                        └ {c.option_name}
                        {c.price_supplement > 0 && (
                          <span className="ml-1 text-primary">+{c.price_supplement.toFixed(2)} €</span>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-muted-foreground whitespace-nowrap">
                {Number(item.total_price).toFixed(2)} €
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderItemsDisplay;
