import { Download } from "lucide-react";
import { computeVat, getVatRateForOrderType, type VatRateKey, orderTypeLabel, paymentMethodLabel } from "@/lib/vatUtils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { safeToast } from "@/lib/safeToast";
import type { Tables } from "@/integrations/supabase/types";

type ExportOrder = Pick<Tables<"orders">, "total" | "order_type" | "created_at" | "order_number" | "payment_method">;

interface CompanyInfo {
  company_name?: string | null;
  vat_number?: string | null;
  company_address?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
}

interface Props {
  orders: ExportOrder[];
  overrideRate: VatRateKey | null;
  companyInfo: CompanyInfo;
  periodLabel: string;
}

function buildRows(orders: ExportOrder[], overrideRate: VatRateKey | null) {
  return orders.map((o) => {
    const total = Number(o.total);
    const rate = overrideRate || getVatRateForOrderType(o.order_type || "takeaway");
    const v = computeVat(total, rate);
    return {
      date: format(new Date(o.created_at), "dd/MM/yyyy HH:mm", { locale: fr }),
      numero: String(o.order_number).padStart(3, "0"),
      type: orderTypeLabel(o.order_type || "takeaway"),
      paiement: paymentMethodLabel(o.payment_method || "cash"),
      htva: v.htva.toFixed(2),
      taux: `${rate}%`,
      tva: v.tva.toFixed(2),
      tvac: v.tvac.toFixed(2),
    };
  });
}

function buildCompanyHeader(ci: CompanyInfo): string {
  const lines: string[] = [];
  if (ci.company_name) lines.push(ci.company_name);
  if (ci.vat_number) lines.push(`TVA: ${ci.vat_number}`);
  if (ci.company_address) lines.push(ci.company_address);
  if (ci.company_email) lines.push(ci.company_email);
  if (ci.company_phone) lines.push(ci.company_phone);
  return lines.join("\n");
}

function exportCSV(orders: ExportOrder[], overrideRate: VatRateKey | null, ci: CompanyInfo, periodLabel: string) {
  const rows = buildRows(orders, overrideRate);
  const header = buildCompanyHeader(ci);
  const csvHeader = "Date;N°;Type;Paiement;HTVA;Taux;TVA;TVAC";
  const csvRows = rows.map(r => `${r.date};${r.numero};${r.type};${r.paiement};${r.htva};${r.taux};${r.tva};${r.tvac}`);

  // Totals
  const totals = rows.reduce((acc, r) => ({
    htva: acc.htva + parseFloat(r.htva),
    tva: acc.tva + parseFloat(r.tva),
    tvac: acc.tvac + parseFloat(r.tvac),
  }), { htva: 0, tva: 0, tvac: 0 });

  csvRows.push(`;;;TOTAL;${totals.htva.toFixed(2)};;${totals.tva.toFixed(2)};${totals.tvac.toFixed(2)}`);

  const content = [header, "", `Période: ${periodLabel}`, "", csvHeader, ...csvRows].join("\n");
  downloadFile(content, `recap-tva-${periodLabel}.csv`, "text/csv;charset=utf-8");
  safeToast.success("CSV exporté");
}

function exportExcel(orders: ExportOrder[], overrideRate: VatRateKey | null, ci: CompanyInfo, periodLabel: string) {
  // TSV format that Excel opens correctly
  const rows = buildRows(orders, overrideRate);
  const header = buildCompanyHeader(ci).replace(/\n/g, "\t\t\t\t\t\t\t\n");
  const tsvHeader = "Date\tN°\tType\tPaiement\tHTVA\tTaux\tTVA\tTVAC";
  const tsvRows = rows.map(r => `${r.date}\t${r.numero}\t${r.type}\t${r.paiement}\t${r.htva}\t${r.taux}\t${r.tva}\t${r.tvac}`);

  const totals = rows.reduce((acc, r) => ({
    htva: acc.htva + parseFloat(r.htva),
    tva: acc.tva + parseFloat(r.tva),
    tvac: acc.tvac + parseFloat(r.tvac),
  }), { htva: 0, tva: 0, tvac: 0 });

  tsvRows.push(`\t\t\tTOTAL\t${totals.htva.toFixed(2)}\t\t${totals.tva.toFixed(2)}\t${totals.tvac.toFixed(2)}`);

  const content = [header, "", `Période: ${periodLabel}`, "", tsvHeader, ...tsvRows].join("\n");
  downloadFile(content, `recap-tva-${periodLabel}.xls`, "application/vnd.ms-excel;charset=utf-8");
  safeToast.success("Excel exporté");
}

function exportPDF(orders: ExportOrder[], overrideRate: VatRateKey | null, ci: CompanyInfo, periodLabel: string) {
  const rows = buildRows(orders, overrideRate);
  const totals = rows.reduce((acc, r) => ({
    htva: acc.htva + parseFloat(r.htva),
    tva: acc.tva + parseFloat(r.tva),
    tvac: acc.tvac + parseFloat(r.tvac),
  }), { htva: 0, tva: 0, tvac: 0 });

  const companyLines = buildCompanyHeader(ci).split("\n");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Récap TVA</title>
<style>
body{font-family:Arial,sans-serif;padding:30px;font-size:12px;color:#222}
h1{font-size:18px;margin-bottom:4px}
.company{margin-bottom:16px;color:#555;line-height:1.5}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:right}
th{background:#f5f5f5;font-weight:bold;text-align:right}
th:first-child,td:first-child{text-align:left}
tfoot td{font-weight:bold;border-top:2px solid #333}
.period{font-size:13px;color:#666;margin-bottom:8px}
@media print{body{padding:10px}}
</style></head><body>
<h1>Récapitulatif TVA</h1>
<div class="company">${companyLines.map(l => `<div>${l}</div>`).join("")}</div>
<div class="period">Période : ${periodLabel}</div>
<table>
<thead><tr><th>Date</th><th>N°</th><th>Type</th><th>Paiement</th><th>HTVA</th><th>Taux</th><th>TVA</th><th>TVAC</th></tr></thead>
<tbody>${rows.map(r => `<tr><td>${r.date}</td><td>${r.numero}</td><td>${r.type}</td><td>${r.paiement}</td><td>${r.htva} €</td><td>${r.taux}</td><td>${r.tva} €</td><td>${r.tvac} €</td></tr>`).join("")}</tbody>
<tfoot><tr><td colspan="4">TOTAL</td><td>${totals.htva.toFixed(2)} €</td><td></td><td>${totals.tva.toFixed(2)} €</td><td>${totals.tvac.toFixed(2)} €</td></tr></tfoot>
</table>
<script>window.onload=()=>window.print()</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    safeToast.error("Popup bloquée — autorisez les popups");
  }
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const RecapExport = ({ orders, overrideRate, companyInfo, periodLabel }: Props) => {
  if (orders.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => exportCSV(orders, overrideRate, companyInfo, periodLabel)}
        className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors"
      >
        <Download className="h-3.5 w-3.5" /> CSV
      </button>
      <button
        onClick={() => exportExcel(orders, overrideRate, companyInfo, periodLabel)}
        className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors"
      >
        <Download className="h-3.5 w-3.5" /> Excel
      </button>
      <button
        onClick={() => exportPDF(orders, overrideRate, companyInfo, periodLabel)}
        className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors"
      >
        <Download className="h-3.5 w-3.5" /> PDF
      </button>
    </div>
  );
};

export default RecapExport;
