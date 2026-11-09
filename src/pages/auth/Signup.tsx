import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { safeInternalRedirect } from "@/lib/safeInternalRedirect";
import { ArrowLeft, Loader2 } from "lucide-react";
import ClientLayout from "@/layouts/ClientLayout";

function getSafeRedirect(params: URLSearchParams): string {
  return safeInternalRedirect(params.get("redirect"));
}


const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = getSafeRedirect(searchParams);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 6) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setLoading(false);
    if (error) {
      setError("Impossible de créer le compte. Vérifiez vos informations.");
    } else {
      setSuccess(true);
    }
  };

  const handleOAuthSignup = async (provider: "google" | "apple") => {
    setOauthLoading(provider);
    setError(null);
    sessionStorage.setItem("rzfood_oauth_redirect", redirect);

    if (provider === "apple") {
      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin + "/auth/callback",
      });
      if (result.error) {
        setError("Erreur de connexion. Réessayez.");
        setOauthLoading(null);
      }
    } else {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth/callback",
          queryParams: { access_type: "offline", prompt: "select_account" },
        },
      });
      if (error) {
        setError("Erreur de connexion. Réessayez.");
        setOauthLoading(null);
      }
    }
  };

  if (success) {
    return (
      <ClientLayout>
        <div className="px-4 py-20 text-center">
          <h2 className="text-lg font-bold text-foreground mb-2">Vérifiez votre email</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Un lien de confirmation a été envoyé à <strong>{email}</strong>
          </p>
          <Link to="/cart" className="text-sm font-semibold text-primary">
            Retour au panier
          </Link>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4 pb-10">
        <button onClick={() => navigate(redirect, { replace: true })} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground bg-transparent border-none cursor-pointer p-0">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <h1 className="mb-6 text-xl font-extrabold text-foreground">Créer un compte</h1>

        <button
          disabled
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border bg-card py-3 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {oauthLoading === "google" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          )}
          Connexion Google — En cours (pas encore disponible)
        </button>

        <button
          onClick={() => handleOAuthSignup("apple")}
          disabled={!!oauthLoading}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border bg-foreground py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
        >
          {oauthLoading === "apple" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          )}
          Continuer avec Apple
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSignup} className="space-y-3">
          <input type="text" placeholder="Votre nom" value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground" />
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground" />
          <input type="password" placeholder="Mot de passe (min. 6 caractères)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Créer mon compte"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Déjà un compte ? <Link to={`/auth/login?redirect=${encodeURIComponent(redirect)}`} className="font-semibold text-primary">Se connecter</Link>
        </p>
      </div>
    </ClientLayout>
  );
};

export default Signup;
