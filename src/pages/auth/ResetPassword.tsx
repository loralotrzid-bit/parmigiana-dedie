import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, Lock } from "lucide-react";
import ClientLayout from "@/layouts/ClientLayout";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase will auto-sign-in the user from the recovery link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check if already in recovery state
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    }

    // Fallback: if user landed here with a valid session, allow reset
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message || "Erreur lors de la mise à jour.");
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/auth/login", { replace: true }), 2500);
    }
  };

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4 pb-10">
        <h1 className="mb-2 text-xl font-extrabold text-foreground flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          Nouveau mot de passe
        </h1>

        {success ? (
          <div className="rounded-xl border-2 border-success/30 bg-success/5 p-6 text-center space-y-3">
            <CheckCircle className="mx-auto h-10 w-10 text-success" />
            <p className="text-sm font-bold text-foreground">Mot de passe mis à jour !</p>
            <p className="text-xs text-muted-foreground">Redirection vers la connexion…</p>
          </div>
        ) : !ready ? (
          <div className="flex flex-col items-center py-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p className="text-sm">Vérification du lien…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 mt-4">
            <input
              type="password"
              placeholder="Nouveau mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
            />
            <input
              type="password"
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Réinitialiser"}
            </button>
          </form>
        )}
      </div>
    </ClientLayout>
  );
};

export default ResetPassword;
