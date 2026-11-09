/**
 * Print Service for 80mm thermal ticket generation.
 * Uses window.print() with a hidden iframe as initial approach.
 * Architecture supports future ESC/POS, node-thermal-printer migration.
 */

export interface PrintableOrder {
  order_number: number;
  created_at: string;
  order_type: string;
  table_number?: number | null;
  note?: string | null;
  client_phone?: string | null;
  delivery_address?: string | null;
  total: number;
  payment_status: string;
  payment_method?: string | null;
  items?: {
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    choices?: { option_name: string; price_supplement: number }[];
  }[];
}

export interface PrintOptions {
  restaurantName?: string;
  type?: "kitchen" | "receipt";
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function orderTypeLabel(type: string): string {
  switch (type) {
    case "delivery": return "🚚 Livraison";
    case "takeaway": return "🛍️ À emporter";
    case "dine_in": return "🍽️ Sur place";
    default: return type;
  }
}

function generateTicketHTML(order: PrintableOrder, options: PrintOptions = {}): string {
  const { restaurantName = "Restaurant", type = "kitchen" } = options;
  const orderNum = String(order.order_number).padStart(3, "0");

  // Extract client name from note
  let clientName = "";
  if (order.note && order.note.includes("Client:")) {
    clientName = order.note.split("|")[0].replace("Client:", "").trim();
  }

  const itemsHTML = (order.items || [])
    .map((item) => {
      const choicesHTML = (item.choices || [])
        .map((c) => `<div style="padding-left:16px;font-size:11px;color:#555;">+ ${c.option_name}${c.price_supplement > 0 ? ` (+${c.price_supplement.toFixed(2)}€)` : ""}</div>`)
        .join("");
      return `
        <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:13px;">
          <span><strong>${item.quantity}x</strong> ${item.product_name}</span>
          <span style="white-space:nowrap;">${item.total_price.toFixed(2)}€</span>
        </div>
        ${choicesHTML}
      `;
    })
    .join("");

  const tableInfo = order.table_number ? `<div style="font-size:16px;font-weight:900;text-align:center;margin:4px 0;">TABLE ${order.table_number}</div>` : "";

  const clientInfo = [
    clientName && `<div style="font-size:12px;">👤 ${clientName}</div>`,
    order.client_phone && `<div style="font-size:12px;">📞 ${order.client_phone}</div>`,
    order.delivery_address && `<div style="font-size:11px;">📍 ${order.delivery_address}</div>`,
  ].filter(Boolean).join("");

  const noteText = order.note && order.note.includes("|")
    ? order.note.split("|").slice(1).join("|").trim()
    : (!order.note?.includes("Client:") ? order.note : "");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Ticket #${orderNum}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', monospace;
    width: 80mm;
    padding: 6mm 4mm;
    color: #000;
    background: #fff;
  }
  .divider {
    border-top: 1px dashed #000;
    margin: 6px 0;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
</style>
</head>
<body>
  <div class="center" style="font-size:14px;font-weight:900;margin-bottom:4px;">${restaurantName}</div>
  <div class="divider"></div>
  
  <div style="display:flex;justify-content:space-between;font-size:20px;font-weight:900;margin:6px 0;">
    <span>#${orderNum}</span>
    <span>${formatTime(order.created_at)}</span>
  </div>
  <div class="center" style="font-size:14px;font-weight:bold;margin:4px 0;">
    ${orderTypeLabel(order.order_type)}
  </div>
  ${tableInfo}
  <div class="center" style="font-size:11px;color:#555;">${formatDate(order.created_at)}</div>
  
  ${clientInfo ? `<div class="divider"></div>${clientInfo}` : ""}
  
  <div class="divider"></div>
  
  ${itemsHTML}
  
  <div class="divider"></div>
  
  <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;margin:4px 0;">
    <span>TOTAL</span>
    <span>${Number(order.total).toFixed(2)}€</span>
  </div>
  
  <div class="center" style="font-size:11px;font-weight:bold;margin:2px 0;">
    ${order.payment_status === "paid" ? "✅ PAYÉ" : "⏳ NON PAYÉ"}
    ${order.payment_method ? ` — ${order.payment_method === "cash" ? "Espèces" : order.payment_method === "card_delivery" ? "Carte" : order.payment_method}` : ""}
  </div>
  
  ${noteText ? `<div class="divider"></div><div style="font-size:11px;font-style:italic;">📝 ${noteText}</div>` : ""}
  
  <div class="divider"></div>
  <div class="center" style="font-size:10px;color:#888;margin-top:4px;">Rz Food — Merci !</div>
</body>
</html>`;
}

/**
 * Print an order ticket using a hidden iframe + window.print().
 * Compatible with all browsers and thermal printers connected via OS.
 */
export function printOrderTicket(order: PrintableOrder, options: PrintOptions = {}): void {
  const html = generateTicketHTML(order, options);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-10000px";
  iframe.style.left = "-10000px";
  iframe.style.width = "80mm";
  iframe.style.height = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Wait for content to render then print
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.print();
      // Clean up after print dialog closes
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 300);
  };

  // Fallback if onload doesn't fire (some browsers)
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch { /* Printing may close or detach its temporary iframe. */ }
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* The iframe may already be detached. */ }
    }, 1000);
  }, 800);
}

// --- Auto-print settings (localStorage) ---

const AUTO_PRINT_KEY = "rz_auto_print";

export function getAutoPrintEnabled(): boolean {
  return localStorage.getItem(AUTO_PRINT_KEY) === "true";
}

export function setAutoPrintEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_PRINT_KEY, enabled ? "true" : "false");
}
