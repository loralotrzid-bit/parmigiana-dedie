import { useEffect, useState } from "react";
import { ArrowLeft, Send, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "@/layouts/ClientLayout";
import { useResolvedAuthUser } from "@/hooks/useResolvedAuthUser";
import { supabase } from "@/integrations/supabase/client";
import { safeToast } from "@/lib/safeToast";
import { z } from "zod";

const ticketSchema = z.object({
  email: z.string().trim().email("Adresse email invalide").max(255),
  subject: z.string().trim().min(1, "Le sujet est requis").max(200),
  message: z.string().trim().min(10, "Le message doit faire au moins 10 caractères").max(2000),
});

const Support = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useResolvedAuthUser();
  const [email, setEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = ticketSchema.safeParse({ email, subject, message });
    if (!parsed.success) {
      safeToast.error(parsed.error.issues[0]?.message ?? "Formulaire invalide");
      return;
    }
    if (!user) {
      safeToast.error("Veuillez vous connecter pour envoyer un message.");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("support_tickets").insert({
      user_id: user.id,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });
    setSending(false);
    if (error) {
      safeToast.error("Erreur lors de l'envoi. Réessayez.");
      return;
    }
    setSent(true);
    safeToast.success("Message envoyé ! Nous vous répondrons rapidement.");
  };

  if (authLoading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </ClientLayout>
    );
  }

  if (sent) {
    return (
      <ClientLayout>
        <div className="animate-fade-in flex flex-col items-center justify-center px-4 py-20 text-center">
          <CheckCircle2 className="h-16 w-16 text-success mb-4" />
          <h1 className="text-xl font-extrabold text-foreground mb-2">Message envoyé !</h1>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Notre équipe a bien reçu votre demande et vous répondra dans les plus brefs délais à l'adresse {email}.
          </p>
          <button
            onClick={() => navigate("/account")}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Retour à mon compte
          </button>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4 pb-10 max-w-lg mx-auto">
        <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

        <h1 className="mb-2 text-xl font-extrabold text-foreground">Contacter le support</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Un problème, une question ? Envoyez-nous un message et nous vous répondrons rapidement.
        </p>

        {!user || user.is_anonymous ? (
          <div className="rounded-xl border-2 border-primary bg-primary/5 p-5 text-center">
            <Mail className="h-8 w-8 text-primary mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground mb-2">Connexion requise</p>
            <p className="text-xs text-muted-foreground mb-4">Connectez-vous pour nous envoyer un message.</p>
            <button
              onClick={() => {
                navigate(`/auth/login?redirect=${encodeURIComponent("/support")}`);
              }}
              className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Se connecter
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                placeholder="votre@email.com"
                required
                maxLength={255}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Sujet</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                placeholder="Ex: Problème avec une commande"
                required
                maxLength={200}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none min-h-[120px] resize-y"
                placeholder="Décrivez votre demande en détail..."
                required
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{message.length}/2000</p>
            </div>
            <button
              type="submit"
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Envoi en cours..." : "Envoyer le message"}
            </button>
          </form>
        )}

        <div className="mt-8 rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Vous pouvez également nous contacter directement par email à{" "}
            <a href="mailto:support@rzfood.com" className="text-primary font-semibold hover:underline">
              support@rzfood.com
            </a>
          </p>
        </div>
      </div>
    </ClientLayout>
  );
};

export default Support;
