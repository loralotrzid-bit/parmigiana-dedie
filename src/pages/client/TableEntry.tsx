import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, ShoppingBag, Loader2 } from "lucide-react";
import { getServiceTable, getTableServiceStatus, requestTableService } from "@/services/tableService";

export default function TableEntry() {
  const { token = "" } = useParams();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const table = useQuery({ queryKey: ["service-table", token], queryFn: () => getServiceTable(token), retry: false });
  const serviceCall = useQuery({
    queryKey: ["table-service-status", token],
    queryFn: () => getTableServiceStatus(token),
    enabled: table.isSuccess && !!table.data,
    retry: false,
    refetchInterval: (query) => query.state.data === "pending" || query.state.data === "acknowledged" ? 5000 : false,
    refetchIntervalInBackground: true,
  });
  const callActive = serviceCall.data === "pending" || serviceCall.data === "acknowledged";
  const callWaiter = async () => {
    if (busy || sent || callActive || !serviceCall.isSuccess) return;
    setBusy(true); setError("");
    try {
      await requestTableService(token);
      setSent(true);
      const status = await serviceCall.refetch();
      if (status.isSuccess) setSent(false);
      else setError("Votre appel est transmis, mais son état ne peut pas être vérifié. Réessayez dans un instant.");
    }
    catch (e) {
      setSent(true);
      setError(e instanceof Error ? e.message : "Appel non transmis.");
      // The request may have reached the server even if its response was lost.
      const status = await serviceCall.refetch();
      if (status.isSuccess) setSent(false);
    }
    finally { setBusy(false); }
  };
  const locked = busy || sent || callActive || serviceCall.isPending || serviceCall.isError;
  const retryStatus = async () => {
    const status = await serviceCall.refetch();
    if (status.isSuccess) { setSent(false); setError(""); }
  };
  return <main className="min-h-screen bg-[#faf5e9] text-[#243529] grid place-items-center p-5">
    <section className="max-w-lg w-full rounded-3xl border border-[#243529]/15 p-7 sm:p-10 shadow-sm">
      <p className="uppercase text-xs tracking-[.2em] mb-6">La Parmigiana</p>
      {table.isPending ? <Loader2 className="animate-spin" aria-label="Chargement de la table" /> : table.error ? <p role="alert">{table.error.message}</p> : table.data && serviceCall.isPending ? <Loader2 className="animate-spin" aria-label="Vérification de l’appel serveur" /> : table.data && serviceCall.isError ? <div role="alert" className="space-y-4"><p>Impossible de vérifier si un appel serveur est déjà en cours. Les actions de la table restent bloquées pour éviter un doublon.</p><button onClick={() => void retryStatus()} className="underline">Réessayer</button></div> : table.data && busy ? <section role="status" aria-live="polite" className="text-center"><Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin"/><h1 className="font-serif text-3xl">Transmission de l’appel…</h1></section> : table.data && (callActive || sent) ? <section role="status" aria-live="polite" className="text-center"><Bell className="mx-auto mb-4 h-10 w-10"/><h1 className="font-serif text-4xl mb-3">Le serveur arrive</h1><p className="text-sm">Votre appel pour la table {table.data.table_number} est {serviceCall.data === "acknowledged" ? "pris en charge" : "transmis"}.</p><p className="text-xs mt-4 text-[#65705e]">Cette page restera bloquée jusqu’à la clôture de l’appel par l’équipe. Vous pouvez la recharger sans perdre votre demande.</p>{sent && !callActive && <button onClick={() => void retryStatus()} className="mt-5 underline">Vérifier l’appel</button>}{error && <p role="alert" className="mt-4 text-red-700">{error}</p>}</section> : table.data && <>
        <h1 className="font-serif text-4xl mb-3">Bienvenue à la table {table.data.table_number}</h1>
        <p className="text-sm mb-7">Commandez à votre rythme ou demandez l’aide de notre équipe.</p>
        <Link to={`/menu/la-parmigiana?table_token=${encodeURIComponent(token)}`} className="flex gap-4 items-center rounded-2xl bg-[#243529] text-white p-5 mb-4"><ShoppingBag /><span><strong className="block">Commander sur RZ Food</strong><span className="text-sm">Votre commande sera associée à cette table.</span></span></Link>
        <button disabled={locked} onClick={callWaiter} className="w-full flex gap-4 items-center rounded-2xl border border-[#243529]/30 p-5 text-left disabled:opacity-70"><Bell /><span><strong className="block">{busy ? "Transmission…" : "Demander au serveur"}</strong><span className="text-sm">Un membre de l’équipe viendra à votre table.</span></span></button>
        {error && <p role="alert" className="text-red-700 mt-4">{error}</p>}
      </>}
    </section>
  </main>;
}
