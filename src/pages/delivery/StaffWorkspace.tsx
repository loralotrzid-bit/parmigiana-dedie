import { useState } from "react";
import { Loader2 } from "lucide-react";
import DeliveryLayout from "@/layouts/DeliveryLayout";
import { useDeliveryDriver } from "@/hooks/useDeliveryDriver";
import StaffCashier from "./StaffCashier";
import StaffService from "./StaffService";

type Panel = "service" | "cashier";

export default function StaffWorkspace() {
  const { driver, driverCode, isLoading, loginForm, logout } = useDeliveryDriver();
  const [panel, setPanel] = useState<Panel>("service");
  if (isLoading) return <DeliveryLayout><div className="grid min-h-60 place-items-center"><Loader2 className="animate-spin" /></div></DeliveryLayout>;
  if (!driver) return <DeliveryLayout>{loginForm}</DeliveryLayout>;
  if (!driver.can_serve) return <DeliveryLayout driverCode={driverCode} onLogout={logout} canDeliver={driver.can_deliver} canServe={driver.can_serve}><div className="p-6">L’accès au service en salle et à la caisse mobile est désactivé pour ce compte.</div></DeliveryLayout>;

  return <DeliveryLayout driverCode={driverCode} onLogout={logout} canDeliver={driver.can_deliver} canServe={driver.can_serve}>
    <div className="mx-auto max-w-xl px-4 pt-4">
      <h1 className="text-xl font-extrabold">Espace serveur</h1>
      <div className="mt-4 grid grid-cols-2 rounded-xl border bg-card p-1" role="tablist" aria-label="Espace serveur">
        <button role="tab" aria-selected={panel === "service"} onClick={() => setPanel("service")} className={`rounded-lg py-2 text-sm font-semibold ${panel === "service" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Salle · Appels</button>
        <button role="tab" aria-selected={panel === "cashier"} onClick={() => setPanel("cashier")} className={`rounded-lg py-2 text-sm font-semibold ${panel === "cashier" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Caisse · Tables</button>
      </div>
    </div>
    {panel === "service" ? <StaffService embedded /> : <StaffCashier embedded />}
  </DeliveryLayout>;
}
