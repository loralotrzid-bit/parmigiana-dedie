import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { getAvailableServiceTables, getServiceTable, getTableServiceStatus, getTableServiceStatusByNumber, requestTableServiceByNumber } from "@/services/tableService";
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus, ShoppingBag, X, UtensilsCrossed, Store, Loader2, FileText, Bell, Check } from "lucide-react";
import { fetchRestaurantBySlug } from "@/services/restaurantService";
import { fetchMenuByRestaurantId } from "@/services/menuService";
import { prepareMenuCart } from "@/services/digitalMenuService";
import { requestTableService } from "@/services/tableService";
import ProductModal from "@/components/product/ProductModal";
import type { CartItem } from "@/contexts/CartContext";
import { useCart } from "@/contexts/useCart";
import { menuBasePrice, isWeekend } from "../../../supabase/functions/_shared/menuPricing";

const euro = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
type Selection = Omit<CartItem, "id">;
interface MenuProduct {
  id: string; name: string; description: string | null; price: number;
  is_available: boolean; weekend_only?: boolean; image_url?: string | null;
  menu_supplement?: number | null; menu_label?: string | null;
}
interface MenuCategory { id: string; name: string; products: MenuProduct[]; }
function loadSavedSelection(key: string): Selection[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 100_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 100).filter((value): value is Selection => {
      if (!value || typeof value !== "object") return false;
      const item = value as Partial<Selection>;
      return typeof item.restaurant_id === "string" && typeof item.product_id === "string" &&
        typeof item.product_name === "string" && Number.isFinite(item.unit_price) && Number(item.unit_price) >= 0 &&
        Number.isInteger(item.quantity) && Number(item.quantity) > 0 && Number(item.quantity) <= 99 &&
        Array.isArray(item.options) && item.options.length <= 30 && item.options.every((option) =>
          !!option && typeof option.name === "string" && Number.isFinite(option.price) && Number(option.price) >= 0);
    });
  } catch { return []; }
}
export default function DigitalMenu() {
  const slug = "la-parmigiana";
  const navigate = useNavigate();
  const { refreshCart } = useCart();
  const [params] = useSearchParams();
  const tableToken = params.get("table_token") || undefined;
  const tableInfo = useQuery({ queryKey: ["service-table", tableToken], queryFn: () => getServiceTable(tableToken!), enabled: !!tableToken, retry: false });
  const [mode, setMode] = useState<"dine_in" | "takeaway" | null>(tableToken ? "dine_in" : null);
  const [directTableNumber, setDirectTableNumber] = useState<number | null>(() => {
    const pending = Number(sessionStorage.getItem("parmigiana_waiter_pending"));
    return Number.isInteger(pending) && pending >= 1 && pending <= 10 ? pending : null;
  });
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [tableIntent, setTableIntent] = useState<"order" | "waiter" | null>(null);
  useEffect(() => {
    sessionStorage.setItem("parmigiana_menu_return", tableToken
      ? `/menu/la-parmigiana?table_token=${encodeURIComponent(tableToken)}`
      : "/menu/la-parmigiana?counter=1");
    sessionStorage.setItem("parmigiana_menu_mode", tableToken ? "dine_in" : "");
  }, [tableToken]);
  useEffect(() => { if (mode) sessionStorage.setItem("parmigiana_menu_mode", mode); }, [mode]);
  const { data: tableOptions, isError: tableOptionsError } = useQuery({ queryKey: ["digital-menu-table-options"], queryFn: getAvailableServiceTables, enabled: !tableToken, retry: false });
  const [waiterCalled, setWaiterCalled] = useState(() => !!sessionStorage.getItem("parmigiana_waiter_pending"));
  const effectiveTableNumber = tableInfo.data?.table_number ?? directTableNumber;
  const serviceCall = useQuery({ queryKey: ["table-service-status", tableToken || effectiveTableNumber], queryFn: () => tableToken ? getTableServiceStatus(tableToken) : getTableServiceStatusByNumber(effectiveTableNumber!), enabled: (!!tableToken && !!tableInfo.data) || (!tableToken && !!effectiveTableNumber && waiterCalled), refetchInterval: 5000, refetchIntervalInBackground: true, retry: false });
  const selectionStorageKey = `parmigiana-menu-selection:${tableToken || "counter"}`;
  const [selectionState, setSelectionState] = useState(() => ({ key: selectionStorageKey, items: loadSavedSelection(selectionStorageKey) }));
  const selection = selectionState.key === selectionStorageKey ? selectionState.items : [];
  const setSelection = (update: Selection[] | ((current: Selection[]) => Selection[])) => {
    setSelectionState((current) => {
      const currentItems = current.key === selectionStorageKey ? current.items : loadSavedSelection(selectionStorageKey);
      return { key: selectionStorageKey, items: typeof update === "function" ? update(currentItems) : update };
    });
  };
  useEffect(() => {
    if (selectionState.key !== selectionStorageKey) return;
    if (selectionState.items.length) sessionStorage.setItem(selectionStorageKey, JSON.stringify(selectionState.items));
    else sessionStorage.removeItem(selectionStorageKey);
  }, [selectionState, selectionStorageKey]);
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiterBusy, setWaiterBusy] = useState(false);
  useEffect(() => {
    if (serviceCall.isSuccess && !serviceCall.data) {
      setWaiterCalled(false);
      sessionStorage.removeItem("parmigiana_waiter_pending");
      if (!tableToken) setDirectTableNumber(null);
    }
  }, [serviceCall.data, serviceCall.isSuccess, tableToken]);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const { data: restaurant, isLoading, isError } = useQuery({ queryKey: ["restaurant", slug], queryFn: () => fetchRestaurantBySlug(slug) });
  const { data: categories = [] } = useQuery<MenuCategory[]>({ queryKey: ["digital-menu", restaurant?.id], enabled: !!restaurant?.id, queryFn: () => fetchMenuByRestaurantId(restaurant!.id) });
  const products = useMemo(() => categories.flatMap((c: MenuCategory) => c.products || []), [categories]);
  const base = (p: MenuProduct) => menuBasePrice(Number(p.price), mode || "dine_in", true, Number((restaurant as typeof restaurant & { takeaway_discount: number; digital_menu_enabled: boolean })?.takeaway_discount ?? 1));
  const total = selection.reduce((sum, item) => {
    const p = products.find((p: MenuProduct) => p.id === item.product_id);
    // Reprice the base when switching consumption mode; preserve configured extras.
    return sum + (item.unit_price + (p ? base(p) - Number(p.price) : 0)) * item.quantity;
  }, 0);
  const quantity = selection.reduce((s, i) => s + i.quantity, 0);
  const add = (item: Selection) => {
    // ProductModal sees on-site base so its stored selection stays mode-independent.
    setSelection((items) => [...items, { ...item, unit_price: item.unit_price + (selected ? Number(selected.price) - base(selected) : 0) }]); setSelected(null);
  };
  const changeQuantity = (index: number, delta: number) => setSelection((items) => items.map((item, i) => i === index ? { ...item, quantity: Math.min(99, item.quantity + delta) } : item).filter((i) => i.quantity > 0));
  const handoff = async (selectedTable?: number) => {
    if (!mode || !selection.length || lock.current || (tableToken && !tableInfo.data)) return;
    const tableNumber = tableToken ? tableInfo.data?.table_number : (selectedTable ?? directTableNumber);
    if (mode === "dine_in" && !tableNumber) { setTableIntent("order"); setTableDialogOpen(true); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      await prepareMenuCart(slug, mode, selection, tableToken, tableNumber ?? undefined);
      await refreshCart();
      sessionStorage.removeItem(selectionStorageKey);
      navigate("/cart", { replace: true });
    }
    catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible. Votre sélection est conservée."); setBusy(false); lock.current = false; }
  };
  const callWaiter = async (selectedTable?: number) => {
    if (mode !== "dine_in" || waiterBusy || waiterCalled || serviceCall.data || (tableToken && !tableInfo.data)) return;
    const tableNumber = tableToken ? tableInfo.data?.table_number : (selectedTable ?? directTableNumber);
    if (!tableToken && !tableNumber) { setTableIntent("waiter"); setTableDialogOpen(true); return; }
    setWaiterBusy(true); setError("");
    try {
      if (tableToken) await requestTableService(tableToken);
      else {
        setDirectTableNumber(tableNumber!);
        sessionStorage.setItem("parmigiana_waiter_pending", String(tableNumber));
        await requestTableServiceByNumber(tableNumber!);
      }
      setWaiterCalled(true);
      if (tableToken) await serviceCall.refetch();
    }
    catch (e) { if (!tableToken) sessionStorage.removeItem("parmigiana_waiter_pending"); setError(e instanceof Error ? e.message : "Appel non transmis. Réessayez."); }
    finally { setWaiterBusy(false); }
  };
  const chooseTable = (number: number) => {
    setDirectTableNumber(number); setTableDialogOpen(false);
    const intent = tableIntent; setTableIntent(null);
    if (intent === "order") void handoff(number);
    if (intent === "waiter") void callWaiter(number);
  };
  const serviceLocked = (!!tableToken && !!tableInfo.data && (!serviceCall.isSuccess || !!serviceCall.data || waiterCalled)) || (!tableToken && !!directTableNumber && waiterCalled);
  if (isLoading) return <main className="min-h-screen grid place-items-center bg-[#faf5e9]"><Loader2 className="animate-spin" aria-label="Chargement du menu" /></main>;
  if (isError || !restaurant || !(restaurant as typeof restaurant & { takeaway_discount: number; digital_menu_enabled: boolean }).digital_menu_enabled) return <main className="p-12 text-center">Le menu est indisponible pour le moment. <button onClick={() => window.location.reload()} className="underline">Réessayer</button></main>;
  return <main className="min-h-screen bg-[#faf5e9] text-[#243529] pb-28">
    {busy && <div className="fixed inset-0 z-[140] grid place-items-center bg-[#faf5e9]/95 px-6 backdrop-blur-sm" role="status" aria-live="polite" aria-label="Préparation de votre panier">
      <div className="w-full max-w-sm animate-in fade-in duration-200">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-[#243529] text-[#faf5e9]"><Loader2 size={25} className="animate-spin" /></div>
        <h2 className="text-center font-serif text-2xl">On prépare votre panier</h2>
        <p className="mt-2 text-center text-sm text-[#65705e]">Votre sélection et les prix sont vérifiés.</p>
        <div className="mt-7 space-y-3" aria-hidden="true">{[0, 1, 2].map((line) => <div key={line} className="h-14 animate-pulse rounded-xl bg-[#243529]/[0.08]" />)}</div>
      </div>
    </div>}
    <header className="border-b border-[#243529]/15 px-5 py-5 sm:px-10 flex items-center justify-between max-w-6xl mx-auto">
      <a href={tableToken ? `/menu/la-parmigiana?table_token=${encodeURIComponent(tableToken)}` : "/menu/la-parmigiana"} className="tracking-[.2em] text-xs font-semibold uppercase">La Parmigiana <span className="hidden sm:inline text-[#8a7652]"> · Marcinelle</span></a>
      <a href="/menu-la-parmigiana.pdf" target="_blank" rel="noreferrer" className="text-xs flex items-center gap-2"><FileText size={15}/> Carte originale</a>
    </header>
    <section className="max-w-6xl mx-auto px-5 sm:px-10 pt-10 pb-8 sm:pt-16">
      <p className="text-xs uppercase tracking-[.3em] text-[#8a7652] mb-4">Pizzeria · Cuisine italienne</p>
      <div className="sm:flex justify-between items-end gap-10"><div><h1 className="font-serif text-5xl sm:text-7xl leading-[1.02]">Le goût de <em>Parma.</em></h1><p className="mt-5 text-sm text-[#65705e] max-w-md">Pizzas au feu de bois, cuisine généreuse.<br/>Découvrez la carte et composez votre commande.</p></div><button onClick={() => setMode(null)} className="mt-6 rounded-full border border-[#243529]/25 px-5 py-3 text-sm flex gap-3 items-center">{mode === "takeaway" ? <Store size={18}/> : <UtensilsCrossed size={18}/>} {mode === "takeaway" ? "À emporter · −1 € par article" : mode === "dine_in" ? "Sur place" : "Choisir le service"}{mode && <span className="text-[#8a7652]">Modifier</span>}</button></div>
    </section>
    {tableToken && <div className="max-w-6xl mx-auto px-5 pb-5"><Link className="underline font-semibold" to={`/table/${tableToken}`}>{tableInfo.data ? `Table ${tableInfo.data.table_number} · Demander au serveur` : "Retour à la table"}</Link>{tableInfo.error && <p role="alert" className="text-red-700">{tableInfo.error.message} La commande de table est bloquée.</p>}</div>}
    <nav aria-label="Catégories du menu" className="sticky top-0 z-20 bg-[#faf5e9]/95 backdrop-blur border-y border-[#243529]/15"><div className="max-w-6xl mx-auto px-5 sm:px-10 flex gap-2 overflow-x-auto py-3"><button onClick={() => setCategory(null)} className={`whitespace-nowrap rounded-full px-5 py-2 text-sm ${!category ? 'bg-[#243529] text-white' : ''}`}>Toute la carte</button>{categories.map((c: MenuCategory) => <button key={c.id} onClick={() => setCategory(c.id)} className={`whitespace-nowrap rounded-full px-5 py-2 text-sm ${category===c.id ? 'bg-[#243529] text-white' : ''}`}>{c.name}</button>)}</div></nav>
    <div className="max-w-6xl mx-auto px-5 sm:px-10 py-8">{categories.filter((c: MenuCategory) => !category || c.id === category).map((c: MenuCategory) => <section key={c.id} className="mb-12"><h2 className="font-serif text-3xl mb-5">{c.name}</h2><div className="grid md:grid-cols-2 gap-x-12">{c.products.map((p: MenuProduct) => { const unavailable=!p.is_available || (p.weekend_only && !isWeekend()); return <button key={p.id} disabled={unavailable} onClick={() => setSelected(p)} className="text-left flex justify-between gap-4 py-5 border-b border-[#243529]/15 disabled:opacity-45 group"><div><h3 className="font-semibold text-base">{p.name}</h3>{p.description && <p className="text-sm text-[#65705e] mt-1 leading-relaxed">{p.description}</p>}{p.weekend_only && <p className="text-xs text-[#8a7652] mt-2">Proposé le week-end</p>}<p className="mt-3 font-medium">{euro(base(p))}</p></div><span className="shrink-0 self-center border border-[#243529]/25 rounded-full p-2 group-hover:bg-[#243529] group-hover:text-white"><Plus size={18}/></span></button>; })}</div></section>)}</div>
    <footer className="max-w-6xl mx-auto px-5 sm:px-10 text-sm text-[#65705e] border-t border-[#243529]/15 pt-6">Avenue Marius Meurée 57 · 6001 Marcinelle<br/><span className="text-xs">Renseignements allergènes auprès du restaurant. Commandes via RZ Food.</span></footer>
    {!!mode && !!quantity && !serviceLocked && <div className="fixed bottom-5 left-4 right-4 z-30 flex justify-center"><button onClick={() => setBagOpen(true)} className="bg-[#243529] text-white rounded-2xl px-6 py-4 w-full max-w-xl flex justify-between items-center shadow-xl"><span className="flex gap-3 items-center"><ShoppingBag size={20}/>{quantity} article{quantity>1?'s':''} · Voir ma sélection</span><span>{euro(total)} <ArrowRight className="inline ml-2" size={18}/></span></button></div>}
    {!mode && <div className="fixed inset-0 z-[110] bg-[#142119]/60 backdrop-blur-sm grid place-items-center p-5"><section role="dialog" aria-modal="true" aria-labelledby="mode-title" className="bg-[#faf5e9] rounded-3xl p-8 w-full max-w-md shadow-2xl"><p className="uppercase text-xs tracking-[.25em] text-[#8a7652] mb-4">Bienvenue à La Parmigiana</p><h2 id="mode-title" className="font-serif text-4xl mb-3">À votre façon.</h2><p className="text-sm text-[#65705e] mb-7">Comment souhaitez-vous déguster votre repas ?</p>{(restaurant?.dine_in_enabled ? ([['dine_in','Sur place','Profitez de votre repas au restaurant',UtensilsCrossed],['takeaway','À emporter','1 € de moins sur chaque article',Store]] as const) : ([['takeaway','À emporter','1 € de moins sur chaque article',Store]] as const)).map(([value,label,desc,Icon])=><button key={value} onClick={()=>{setMode(value);if(value==='takeaway')setDirectTableNumber(null);}} className="w-full flex items-center gap-4 border border-[#243529]/20 rounded-2xl p-5 mt-3 text-left hover:bg-[#eae5d8]"><Icon size={25}/><span><strong className="block">{label}</strong><span className="text-xs text-[#65705e]">{desc}</span></span><ArrowRight size={18} className="ml-auto"/></button>)}</section></div>}
    {tableDialogOpen && <div className="fixed inset-0 z-[115] bg-[#142119]/70 backdrop-blur-sm grid place-items-center p-5"><section role="dialog" aria-modal="true" aria-labelledby="table-choice-title" className="bg-[#faf5e9] rounded-3xl p-7 w-full max-w-md shadow-2xl"><p className="uppercase text-xs tracking-[.25em] text-[#8a7652] mb-3">La Parmigiana · Sur place</p><h2 id="table-choice-title" className="font-serif text-3xl mb-2">Votre numéro de table ?</h2><p className="text-sm text-[#65705e] mb-5">Sélectionnez votre table pour confirmer l’action.</p>{tableOptionsError && <p role="alert" className="text-sm text-red-700">Impossible de charger les tables. Réessayez.</p>}{!tableOptions && !tableOptionsError && <p className="text-sm text-[#65705e]">Chargement des tables…</p>}{tableOptions?.tables.length === 0 && <p role="alert" className="text-sm text-red-700">Aucune table n’est actuellement disponible. Demandez au personnel.</p>}<div className="grid grid-cols-2 gap-3">{tableOptions?.tables.map(number=><button key={number} onClick={()=>chooseTable(number)} className="rounded-xl bg-[#243529] text-white p-4 font-semibold">Table {number}</button>)}</div><button onClick={()=>{setTableDialogOpen(false);setTableIntent(null);}} className="w-full mt-5 underline text-sm">Annuler</button></section></div>}    {serviceLocked && <div className="fixed inset-0 z-[120] bg-[#142119]/85 backdrop-blur-sm grid place-items-center p-6"><section role="status" aria-live="polite" className="w-full max-w-md rounded-3xl bg-[#faf5e9] p-8 text-center shadow-2xl"><Bell className="mx-auto mb-4 h-10 w-10 text-[#8a7652]"/><h2 className="font-serif text-3xl">{serviceCall.isError ? "Vérification de la table" : "Le serveur arrive"}</h2><p className="mt-3 text-sm text-[#65705e]">{serviceCall.isError ? "La connexion est momentanément indisponible. La page reste verrouillée pour éviter un doublon. Réessayez dans un instant." : <>Votre demande pour la table {effectiveTableNumber} est transmise. La page se débloquera quand le serveur aura terminé.</>}</p>{serviceCall.isError ? <button onClick={() => void serviceCall.refetch()} className="mt-5 rounded-xl bg-[#243529] px-5 py-3 text-sm text-white">Réessayer</button> : <p className="mt-5 text-xs text-[#65705e]">Vérification automatique · rechargez sans crainte</p>}</section></div>}\r\n    {bagOpen && !serviceLocked && <div className="fixed inset-0 z-[105] bg-black/50 flex justify-end"><section role="dialog" aria-modal="true" aria-label="Votre sélection" className="w-full max-w-lg bg-[#faf5e9] h-full p-6 flex flex-col"><div className="flex justify-between items-center"><h2 className="font-serif text-3xl">Votre sélection</h2><button aria-label="Fermer la sélection" onClick={()=>setBagOpen(false)}><X/></button></div><p className="text-sm mt-3 text-[#65705e]">{mode==='takeaway'?'À emporter':'Sur place'} · La Parmigiana</p><div className="overflow-y-auto flex-1 py-5">{selection.map((item,i)=><div key={i} className="py-5 border-b border-[#243529]/15"><strong>{item.product_name}</strong><p className="text-xs text-[#65705e]">{item.options.map(o=>o.name).join(', ')}</p><div className="flex items-center gap-5 mt-3"><button aria-label={`Retirer un ${item.product_name}`} onClick={()=>changeQuantity(i,-1)}><Minus size={17}/></button>{item.quantity}<button aria-label={`Ajouter un ${item.product_name}`} onClick={()=>changeQuantity(i,1)}><Plus size={17}/></button></div></div>)}</div>{error&&<p role="alert" className="text-red-700 text-sm my-3">{error}</p>}{mode === "dine_in" && (tableToken || restaurant?.dine_in_enabled) && <button disabled={waiterBusy || waiterCalled || !!serviceCall.data || (tableToken && !tableInfo.data)} onClick={()=>void callWaiter()} className="mb-3 rounded-xl border border-[#243529]/30 py-4 flex items-center justify-center gap-2 disabled:opacity-60">{waiterCalled?<Check size={18}/>:<Bell size={18}/>} {waiterBusy?"Appel en cours…":waiterCalled?"Le serveur a été prévenu":"Appeler le serveur"}</button>}<button disabled={busy||!quantity} onClick={()=>void handoff()} className="rounded-xl bg-[#243529] text-white py-4 disabled:opacity-50">{busy?'Préparation du panier…':`Vérifier le panier · ${euro(total)}`}</button><p className="text-center text-xs text-[#65705e] mt-3">Récapitulatif avant envoi de la commande.</p></section></div>}
    <ProductModal product={selected ? { ...selected, price: base(selected) } : null} restaurantId={restaurant.id} open={!!selected} onClose={()=>setSelected(null)} onSelectItem={add}/>
  </main>;
}
