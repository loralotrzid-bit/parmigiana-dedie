import { ArrowLeft, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "@/layouts/ClientLayout";

const sections = [
  {
    title: "Mentions légales",
    content: `Éditeur du site : Radoine Chajai\nStatut : Particulier (Projet personnel à but non lucratif)\nContact : support@rzfood.com\nHébergement : Lovable Cloud / Supabase (Serveurs situés en Europe)`,
  },
  {
    title: "Nature du service",
    content: `Concept : RZFood est une plateforme de mise en relation gratuite. Le service permet de consulter les menus et de transmettre des commandes aux restaurateurs partenaires.\n\nPaiement : RZFood n'intervient dans aucune transaction financière. Le paiement des repas se fait exclusivement entre le client et le restaurateur (à la livraison ou au retrait).\n\nResponsabilité : RZFood est un intermédiaire technique. La préparation, la qualité des aliments, le respect des allergènes et la livraison sont sous la responsabilité exclusive du restaurateur. En cas de litige, l'utilisateur doit contacter directement l'établissement concerné.`,
  },
  {
    title: "Protection des données (RGPD)",
    content: `Données collectées : Nom, Email, Téléphone, Adresse de livraison.\n\nUtilisation : Ces données servent uniquement à transmettre votre commande au restaurateur. Elles ne sont jamais revendues à des tiers.\n\nVos droits : Conformément au RGPD, vous avez un droit d'accès et de suppression de vos données. Pour supprimer votre compte, rendez-vous dans Mon compte > Supprimer mon compte, ou envoyez un mail à support@rzfood.com. Vos données seront effacées sous 30 jours.\n\nCookies : Nous utilisons uniquement des cookies techniques nécessaires à votre connexion. Aucun traqueur publicitaire n'est utilisé.`,
  },
];

const Legal = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4 pb-10 max-w-xl mx-auto">
        <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <ArrowLeft className="h-3 w-3" /> Retour
        </button>

        <h1 className="mb-1 text-sm font-bold text-foreground">Informations légales</h1>
        <p className="mb-4 text-[10px] text-muted-foreground/50">Dernière mise à jour : mars 2026 · Version Bêta gratuite</p>

        <div className="space-y-1">
          {sections.map((s, i) => (
            <div key={i} className="rounded-lg border border-border/50 bg-card/50">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <span className="text-[11px] font-medium text-muted-foreground">{s.title}</span>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/40 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && (
                <div className="px-3 pb-3">
                  <p className="text-[10px] leading-[15px] text-muted-foreground/60 whitespace-pre-line">{s.content}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-[9px] text-muted-foreground/40 mt-6">
          © 2026 RZFood — Tous droits réservés
        </p>
      </div>
    </ClientLayout>
  );
};

export default Legal;
