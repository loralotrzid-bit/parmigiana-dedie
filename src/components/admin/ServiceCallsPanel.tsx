import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/useAuth";
import { advanceServiceCall, fetchServiceCalls } from "@/services/tableService";
import { Bell, Check, RefreshCw } from "lucide-react";

export default function ServiceCallsPanel() {
  const { restaurantId } = useAuth();
  const qc = useQueryClient();
  const key = ["service-calls", restaurantId];
  const calls = useQuery({ queryKey: key, queryFn: () => fetchServiceCalls(restaurantId!), enabled: !!restaurantId, refetchInterval: 5000, refetchIntervalInBackground: true, retry: 1 });
  const seenCalls = useRef(new Set<string>());
  const audioContext = useRef<AudioContext | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  useEffect(() => {
    if (!calls.data) return;
    for (const call of calls.data) {
      if (call.status === "pending" && !seenCalls.current.has(call.id) && notificationPermission === "granted") {
        try {
          new Notification(`Appel de la table ${call.table_number}`, { body: "Un client demande le serveur.", tag: `table-call-${call.id}`, requireInteraction: true });
        } catch { /* keep the call visible and ringing in the open admin page */ }
        seenCalls.current.add(call.id);
      }
    }
  }, [calls.data, notificationPermission]);

  const pendingCount = calls.data?.filter((call) => call.status === "pending").length ?? 0;
  useEffect(() => () => { void audioContext.current?.close(); }, []);
  useEffect(() => {
    const context = audioContext.current;
    if (!soundEnabled || pendingCount === 0 || !context || context.state !== "running") return;
    const playAlarm = () => {
      if (context.state !== "running") return;
      const now = context.currentTime;
      for (const [offset, frequency] of [[0, 1040], [0.28, 780], [0.56, 1040]] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.21);
      }
    };
    playAlarm();
    const timer = window.setInterval(playAlarm, 2500);
    return () => window.clearInterval(timer);
  }, [pendingCount, soundEnabled]);

  const enableNotifications = async () => {
    if (typeof window !== "undefined" && "AudioContext" in window) {
      try {
        const Context = window.AudioContext;
        const context = audioContext.current ?? new Context();
        audioContext.current = context;
        await context.resume();
        setSoundEnabled(context.state === "running");
      } catch { setSoundEnabled(false); }
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      setNotificationPermission(await Notification.requestPermission());
    }
  };
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: "acknowledged" | "resolved" }) => advanceServiceCall(id, status), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
  return <section aria-label="Appels des tables" className="rounded-2xl border bg-card p-4">
    <div className="flex items-center justify-between gap-3 mb-3"><h2 className="font-bold text-lg flex items-center gap-2"><Bell className="h-5 w-5" /> Appels des tables {calls.data ? `(${calls.data.length})` : ""}</h2><button aria-label="Actualiser les appels" onClick={() => calls.refetch()}><RefreshCw className={`h-4 w-4 ${calls.isFetching ? "animate-spin" : ""}`} /></button></div>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><p className="text-xs text-muted-foreground">Vue partagée · actualisation toutes les 5 secondes. La sonnerie reste active tant qu’un appel est en attente et que cette page fonctionne.</p><div className="flex items-center gap-2">{!soundEnabled && <button onClick={enableNotifications} className="rounded-lg border px-3 py-2 text-xs font-semibold">Activer sonnerie et notifications</button>}{soundEnabled && <span className="text-xs text-green-700">Sonnerie activée</span>}{notificationPermission === "granted" && <span className="text-xs text-green-700">Notifications activées</span>}{notificationPermission === "denied" && <span className="text-xs text-muted-foreground">Notifications bloquées par le navigateur</span>}{notificationPermission === "unsupported" && <span className="text-xs text-muted-foreground">Notifications système indisponibles</span>}</div></div>
    {calls.isPending && <p>Chargement des appels…</p>}
    {calls.error && <p role="alert" className="text-destructive">{calls.error.message} Les données affichées peuvent être anciennes.</p>}
    {update.error && <p role="alert" className="text-destructive">{update.error.message}</p>}
    <div aria-live="polite" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{calls.data?.map(call => <article key={call.id} className={`rounded-xl p-4 border-2 ${call.status === "pending" ? "border-amber-500 bg-amber-50 text-amber-950" : "border-green-600"}`}>
      <h3 className="text-xl font-bold">Table {call.table_number}</h3><p className="text-sm my-2">{call.status === "pending" ? "Demande un serveur" : "Un serveur arrive"} · {new Date(call.created_at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}</p>
      <button disabled={update.isPending || !!calls.error} onClick={() => update.mutate({ id: call.id, status: call.status === "pending" ? "acknowledged" : "resolved" })} className="rounded-lg bg-primary text-primary-foreground px-4 py-3 font-bold disabled:opacity-50">{call.status === "pending" ? "Je m’en occupe" : <span className="flex gap-2 items-center"><Check size={18} /> Terminer l’appel</span>}</button>
    </article>)}</div>
    {!calls.isPending && !calls.error && !calls.data?.length && <p className="text-muted-foreground">Aucun appel en attente.</p>}
  </section>;
}
