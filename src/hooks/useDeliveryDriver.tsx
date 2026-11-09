import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export interface StaffProfile {
  id: string;
  auth_user_id: string;
  email: string | null;
  driver_code: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  restaurant_id: string;
  can_deliver: boolean;
  can_serve: boolean;
}

export function useDeliveryDriver() {
  const [driver, setDriver] = useState<StaffProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || user.is_anonymous) { if (alive) setDriver(null); return; }
        const { data, error: queryError } = await supabase
          .from("delivery_drivers").select("id,auth_user_id,email,driver_code,full_name,phone,is_active,restaurant_id,can_deliver,can_serve")
          .eq("auth_user_id", user.id).maybeSingle();
        if (queryError) throw queryError;
        if (alive) setDriver(data as StaffProfile | null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Impossible de vérifier le profil.");
      } finally { if (alive) setIsLoading(false); }
    };
    void load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const login = async () => {
    setError(null);
    if (!email.trim() || !password) { setError("Saisissez votre e-mail et votre mot de passe."); return; }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) { setError("Connexion refusée. Vérifiez vos identifiants ou demandez une invitation à l’admin."); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) { setError("Compte personnel requis."); return; }
    const { data, error: profileError } = await supabase.from("delivery_drivers")
      .select("id,auth_user_id,email,driver_code,full_name,phone,is_active,restaurant_id,can_deliver,can_serve")
      .eq("auth_user_id", user.id).maybeSingle();
    if (profileError || !data || !data.is_active || (!data.can_deliver && !data.can_serve)) {
      setDriver(null);
      setError("Ce compte n’a pas de profil personnel actif. Contactez l’administrateur.");
      return;
    }
    setDriver(data as StaffProfile);
    setPassword("");
  };

  const logout = async () => { await supabase.auth.signOut(); setDriver(null); };
  const loginForm = <div className="animate-fade-in px-4 pt-8"><form className="mx-auto max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); void login(); }}>
    <h1 className="text-xl font-extrabold">Connexion personnel</h1>
    <p className="text-sm text-muted-foreground">Accès réservé aux comptes activés par le restaurant.</p>
    <input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" className="w-full rounded-xl border bg-background px-4 py-3 text-sm" />
    <input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" className="w-full rounded-xl border bg-background px-4 py-3 text-sm" />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Se connecter</button>
  </form></div>;
  return { driver, driverCode: driver?.full_name ?? null, isLoading, loginForm, logout };
}
