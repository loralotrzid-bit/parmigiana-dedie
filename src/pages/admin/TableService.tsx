import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import AdminLayout from "@/layouts/AdminLayout";
import ServiceCallsPanel from "@/components/admin/ServiceCallsPanel";
import { useAuth } from "@/contexts/useAuth";
import { fetchRestaurantTables, setRestaurantTableActive } from "@/services/tableService";

function makeStoredZip(files: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const put16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const put32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);
  for (const file of files) {
    const name = encoder.encode(file.name), crc = crc32(file.data);
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    put32(h, 0, 0x04034b50); put16(h, 4, 20); put32(h, 14, crc); put32(h, 18, file.data.length); put32(h, 22, file.data.length); put16(h, 26, name.length); header.set(name, 30);
    local.push(header, file.data);
    const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer);
    put32(d, 0, 0x02014b50); put16(d, 4, 20); put16(d, 6, 20); put32(d, 16, crc); put32(d, 20, file.data.length); put32(d, 24, file.data.length); put16(d, 28, name.length); put32(d, 42, offset); directory.set(name, 46); central.push(directory); offset += header.length + file.data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  put32(e, 0, 0x06054b50); put16(e, 8, files.length); put16(e, 10, files.length); put32(e, 12, centralSize); put32(e, 16, offset);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}

export default function TableService() {
  const { restaurantId } = useAuth();
  const queryClient = useQueryClient();
  const [showQr, setShowQr] = useState(false);
  const [images, setImages] = useState<Record<string, string>>({});
  const [qrError, setQrError] = useState("");
  const tables = useQuery({ queryKey: ["restaurant-tables", restaurantId], queryFn: () => fetchRestaurantTables(restaurantId!), enabled: !!restaurantId });
  const toggleTable = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setRestaurantTableActive(id, active), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["restaurant-tables", restaurantId] }) });
  useEffect(() => {
    let active = true;
    if (!showQr || !tables.data) return;
    Promise.all(tables.data.filter(table => table.is_active && table.table_number <= 5).map(async table => [table.id, await QRCode.toDataURL(`${window.location.origin}/table/${table.qr_token}`, { width: 500, margin: 3 })] as const))
      .then(entries => { if (active) { setImages(Object.fromEntries(entries)); setQrError(""); } })
      .catch(() => { if (active) setQrError("Impossible de générer les QR. Réessayez."); });
    return () => { active = false; };
  }, [showQr, tables.data]);
  const downloadFirstFive = async () => {
    const activeTables = (tables.data || []).filter(table => table.is_active && table.table_number <= 5).sort((a, b) => a.table_number - b.table_number);
    if (activeTables.length !== 5 || activeTables.some(table => !images[table.id])) { setQrError("Active les 5 tables 1 à 5 puis réessaie."); return; }
    const files = activeTables.map(table => ({ name: `la-parmigiana-table-${table.table_number}.png`, data: Uint8Array.from(atob(images[table.id].split(",")[1]), char => char.charCodeAt(0)) }));
    const url = URL.createObjectURL(makeStoredZip(files)); const link = document.createElement("a"); link.href = url; link.download = "QR-La-Parmigiana-tables-1-a-5.zip"; link.click(); URL.revokeObjectURL(url);
  };
  return <AdminLayout><div className="max-w-6xl mx-auto p-4 space-y-5"><h1 className="text-2xl font-bold">Service en salle</h1><ServiceCallsPanel />
    <section className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-bold">Tables disponibles sur place</h2><p className="text-sm text-muted-foreground mt-1 mb-4">Désactivez les tables indisponibles. Les clients ne pourront sélectionner que les tables actives. Le réglage global « Autoriser les commandes sur place » reste dans les paramètres du restaurant.</p>{tables.isPending && <p>Chargement des tables…</p>}{tables.error && <p role="alert" className="text-destructive">{tables.error.message}</p>}<div className="grid grid-cols-2 sm:grid-cols-5 gap-3">{tables.data?.map(table=><button key={table.id} disabled={toggleTable.isPending} onClick={()=>toggleTable.mutate({id:table.id,active:!table.is_active})} aria-pressed={table.is_active} className={`rounded-xl border p-4 text-left ${table.is_active?"border-green-700 bg-green-50":"border-muted bg-muted/40"}`}><span className="block font-bold">Table {table.table_number}</span><span className="text-xs">{table.is_active?"Active · visible aux clients":"Désactivée"}</span></button>)}</div>{toggleTable.error && <p role="alert" className="text-sm text-destructive mt-3">{toggleTable.error.message}</p>}</section>
    <button onClick={() => setShowQr(!showQr)} className="rounded-xl border px-5 py-3 font-semibold">{showQr ? "Masquer les QR" : "Préparer les 5 QR (tables 1 à 5)"}</button>
    {showQr && <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-xl">QR codes des tables 1 à 5</h2><button onClick={() => void downloadFirstFive()} className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground">Télécharger le ZIP des 5 QR</button></div><p className="text-sm text-muted-foreground mb-4">Le ZIP contient les QR actifs des tables 1 à 5 et reprend le domaine actuellement ouvert. Depuis localhost, il ne sera utilisable que sur le réseau local; après déploiement, ouvre cette page admin sur le domaine final et recrée le ZIP.</p>
      {tables.isPending && <p>Chargement des tables…</p>}{tables.error && <p role="alert" className="text-destructive">{tables.error.message}</p>}{qrError && <p role="alert">{qrError}</p>}
      {!tables.isPending && !tables.error && !tables.data?.length && <p>Aucune table active. L’initialisation Supabase est nécessaire.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">{tables.data?.filter(table => table.is_active && table.table_number <= 5).map(table => <article key={table.id} className="border rounded-xl p-4 text-center bg-card"><h3 className="font-bold">Table {table.table_number}</h3>{images[table.id] && <><img src={images[table.id]} alt={`QR de la table ${table.table_number}`} className="w-full max-w-52 mx-auto" /><a href={images[table.id]} download={`la-parmigiana-table-${table.table_number}.png`} className="block underline my-2">Télécharger le QR</a></>}<a className="text-xs underline" href={`/table/${table.qr_token}`} target="_blank" rel="noreferrer">Ouvrir le lien / NFC</a></article>)}</div>
    </section>}
  </div></AdminLayout>;
}
