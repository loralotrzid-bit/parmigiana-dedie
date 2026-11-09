import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCart } from "@/contexts/useCart";

type OrderMode = "dine_in" | "takeaway" | "delivery";

interface Props {
  /** External open control (bypasses QR logic) */
  externalOpen?: boolean;
  /** Called when popup closes externally */
  onClose?: () => void;
  /** Which modes to show. Defaults to dine_in + takeaway (QR behavior). */
  modes?: OrderMode[];
}

const MODE_CONFIG: Record<OrderMode, { emoji: string; label: string }> = {
  dine_in: { emoji: "🍽️", label: "Sur place" },
  takeaway: { emoji: "🥡", label: "À emporter" },
  delivery: { emoji: "🛵", label: "Livraison" },
};

const QrModePopup = ({ externalOpen, onClose, modes }: Props = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showQr, setShowQr] = useState(false);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const { setOrderType } = useCart();

  // QR detection
  useEffect(() => {
    const source = searchParams.get("source");
    const table = searchParams.get("table");

    if (source !== "qr") return;

    sessionStorage.setItem("rzfood_order_source", "qr");

    const parsedTable = table ? parseInt(table, 10) : NaN;
    const hasValidTable = Number.isInteger(parsedTable) && parsedTable > 0;

    // If QR includes table number: force dine_in immediately (no popup)
    if (hasValidTable) {
      setTableNumber(parsedTable);
      sessionStorage.setItem("rzfood_table_number", String(parsedTable));
      setOrderType("dine_in");
      setShowQr(false);
      onClose?.();
    } else {
      // QR without table -> show mode picker once
      const alreadySeen = sessionStorage.getItem("rzfood_qr_seen");
      if (!alreadySeen) {
        setShowQr(true);
        sessionStorage.setItem("rzfood_qr_seen", "1");
      }
    }

    // Clean URL params safely
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("source");
    nextParams.delete("table");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, setOrderType, onClose]);

  const isOpen = showQr || !!externalOpen;
  if (!isOpen) return null;

  // For QR scans, always include dine_in; for external open, use provided modes
  const availableModes: OrderMode[] = showQr
    ? (modes && modes.length > 0 ? modes : ["dine_in", "takeaway"])
    : (modes && modes.length > 0 ? modes : ["takeaway"]);

  const choose = (type: string) => {
    setOrderType(type);
    if (showQr) {
      setShowQr(false);
    }
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-elevated animate-fade-in">
        <h2 className="text-lg font-extrabold text-foreground text-center mb-1">
          Bienvenue ! 👋
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-2">
          Comment souhaitez-vous consommer ?
        </p>
        {tableNumber && showQr && (
          <p className="text-center mb-4">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
              🪑 Table {tableNumber}
            </span>
          </p>
        )}
        <div className="space-y-3">
          {availableModes.map((mode, i) => {
            const { emoji, label } = MODE_CONFIG[mode];
            const isPrimary = i === 0;
            return (
              <button
                key={mode}
                onClick={() => choose(mode)}
                className={`w-full rounded-xl border-2 py-4 text-base font-bold transition-transform active:scale-[0.98] ${
                  isPrimary
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
              >
                {emoji} {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default QrModePopup;
