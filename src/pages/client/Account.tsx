import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogIn, LogOut, User, Loader2, ClipboardList, MapPin, HelpCircle, ShieldAlert, Scale, MessageSquare, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { safeToast } from "@/lib/safeToast";
import ClientLayout from "@/layouts/ClientLayout";
import { useAuth } from "@/contexts/useAuth";
import { useResolvedAuthUser } from "@/hooks/useResolvedAuthUser";
import { supabase } from "@/integrations/supabase/client";
import ProfileCompletion from "@/components/client/ProfileCompletion";

const Account = () => {
  const navigate = useNavigate();
  const { isAdmin, signOut } = useAuth();
  const { user, isLoading: authLoading } = useResolvedAuthUser();
  const [orderCount, setOrderCount] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [showProfileForm, setShowProfileForm] = useState(false);

  // Admin on client side = treated as guest (isolation admin/client)
  const isLoggedIn = !!user && !user.is_anonymous && !isAdmin;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || null;

  useEffect(() => {
    if (!user || !isLoggedIn) {
      setLoadingOrders(false);
      return;
    }
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("guest_session_id", user.id)
      .then(({ count }) => {
        setOrderCount(count ?? 0);
        setLoadingOrders(false);
      });
  }, [user, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    supabase
      .from("profiles")
      .select("display_name, phone")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const needsInfo = !data?.display_name?.trim() || !data?.phone?.trim();
        setShowProfileForm(needsInfo);
      });
  }, [user, isLoggedIn]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
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

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4 pb-10">
        <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

        <h1 className="mb-6 text-xl font-extrabold text-foreground">Mon compte</h1>

        {/* Admin warning banner — admin session detected on client side */}
        {!!user && !user.is_anonymous && isAdmin && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Session administrateur détectée</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Vous êtes connecté(e) en tant qu'admin ({user.email}). Pour commander en tant que client, déconnectez-vous et utilisez un compte client séparé.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate("/admin")}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Aller au panel admin
              </button>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        )}

        {/* Normal client profile card */}
        <div className="mb-6 rounded-xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-card-foreground">
                {isLoggedIn ? (displayName || "Utilisateur") : "Non connecté"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isLoggedIn
                  ? "Vous êtes connecté(e) avec votre compte client."
                  : isAdmin
                    ? "Connectez-vous avec un compte client pour commander."
                    : "Connectez-vous pour commander et suivre vos commandes."}
              </p>
            </div>
          </div>
        </div>

        {isLoggedIn && showProfileForm && (
          <div className="mb-6">
            <ProfileCompletion onComplete={() => setShowProfileForm(false)} />
          </div>
        )}

        {isLoggedIn && (
          <div className="mb-6 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Navigation rapide</p>
            <QuickLink icon={<ClipboardList className="h-5 w-5 text-primary" />} label="Mes commandes" sublabel={`${orderCount} commande${orderCount > 1 ? "s" : ""}`} onClick={() => navigate("/orders")} />
            <QuickLink icon={<MapPin className="h-5 w-5 text-primary" />} label="Explorer les restaurants" sublabel="Découvrir les menus" onClick={() => navigate("/home")} />
            <QuickLink icon={<MessageSquare className="h-5 w-5 text-primary" />} label="Contacter le support" sublabel="Un problème ? Écrivez-nous" onClick={() => navigate("/support")} />
            <QuickLink icon={<Scale className="h-5 w-5 text-primary" />} label="Mentions légales" sublabel="RGPD, confidentialité" onClick={() => navigate("/legal")} />
          </div>
        )}

        {/* Legal links for everyone */}
        {!isLoggedIn && (
          <div className="mb-6 space-y-2">
            <QuickLink icon={<MessageSquare className="h-5 w-5 text-primary" />} label="Contacter le support" sublabel="Un problème ? Écrivez-nous" onClick={() => navigate("/support")} />
            <QuickLink icon={<Scale className="h-5 w-5 text-primary" />} label="Mentions légales" sublabel="RGPD, confidentialité" onClick={() => navigate("/legal")} />
          </div>
        )}

        <div className="space-y-2">
          {!isLoggedIn && !isAdmin ? (
            <button
              onClick={() => {
                navigate(`/auth/login?redirect=${encodeURIComponent("/account")}`);
              }}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 px-4 py-3.5 text-left"
            >
              <LogIn className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-primary">Se connecter</p>
                <p className="text-xs text-muted-foreground">Connectez-vous avec Google ou email</p>
              </div>
            </button>
          ) : isLoggedIn ? (
            <>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-left hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Se déconnecter</p>
                </div>
              </button>

              {/* Delete account */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="flex w-full items-center gap-3 rounded-xl border border-destructive/20 px-4 py-3 text-left hover:bg-destructive/5 transition-colors">
                    <Trash2 className="h-5 w-5 text-destructive/60" />
                    <div>
                      <p className="text-sm font-semibold text-destructive/80">Supprimer mon compte</p>
                      <p className="text-xs text-muted-foreground">Vos données seront effacées sous 30 jours</p>
                    </div>
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer votre compte ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible. Une demande de suppression sera envoyée et vos données seront effacées sous 30 jours. Tous les administrateurs seront notifiés.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        if (!user) return;

                        // 1. Log the deletion request for admin follow-up
                        const { error } = await supabase.from("data_deletion_requests").insert({
                          user_id: user.id,
                          user_email: user.email || "inconnu",
                        });
                        if (error) {
                          safeToast.error("Erreur lors de la demande de suppression");
                          return;
                        }

                        // 2. Immediately wipe profile data so re-login feels fresh
                        await supabase
                          .from("profiles")
                          .update({ display_name: null, phone: null })
                          .eq("user_id", user.id);

                        safeToast.success("Compte supprimé. Vos données ont été effacées.");
                        await signOut();
                        navigate("/");
                      }}
                    >
                      Confirmer la suppression
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </div>
      </div>
    </ClientLayout>
  );
};

const QuickLink = ({ icon, label, sublabel, onClick }: { icon: React.ReactNode; label: string; sublabel: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
  >
    {icon}
    <div className="flex-1">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
    </div>
    <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
  </button>
);

export default Account;
