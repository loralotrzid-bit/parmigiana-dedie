import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import ClientLayout from "@/layouts/ClientLayout";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError("Erreur lors de l'envoi. Vérifiez votre email.");
    } else {
      setSent(true);
    }
  };

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4 pb-10">
        <Link to="/auth/login" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <h1 className="mb-2 text-xl font-extrabold text-foreground">Mot de passe oublié</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Entrez votre email pour recevoir un lien de réinitialisation.
        </p>

        {sent ? (
          <div className="rounded-xl border-2 border-success/30 bg-success/5 p-6 text-center space-y-3">
            <Mail className="mx-auto h-10 w-10 text-success" />
            <p className="text-sm font-bold text-foreground">Email envoyé !</p>
            <p className="text-xs text-muted-foreground">
              Vérifiez votre boîte de réception (et les spams) pour le lien de réinitialisation.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Envoyer le lien"}
            </button>
          </form>
        )}
      </div>
    </ClientLayout>
  );
};

export default ForgotPassword;
