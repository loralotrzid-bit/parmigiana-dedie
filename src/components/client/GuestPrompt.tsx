import { useState } from "react";
import { User, UserPlus, LogIn, CheckCircle } from "lucide-react";

interface GuestPromptProps {
  isAuthenticated?: boolean;
  onContinueGuest: () => void;
  onContinue?: () => void;
  onSignUp: () => void;
  onLogin: () => void;
}

const GuestPrompt = ({ isAuthenticated, onContinueGuest, onContinue, onSignUp, onLogin }: GuestPromptProps) => {
  const [pendingAction, setPendingAction] = useState<"guest" | "signup" | "login" | null>(null);

  const handleConfirm = () => {
    if (pendingAction === "guest") (onContinue || onContinueGuest)();
    else if (pendingAction === "signup") onSignUp();
    else if (pendingAction === "login") onLogin();
    setPendingAction(null);
  };

  if (isAuthenticated) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="h-5 w-5 text-success" />
          <h3 className="text-sm font-bold text-card-foreground">Vous êtes connecté(e)</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Vous pouvez continuer votre commande.</p>
        <button
          onClick={onContinue || onContinueGuest}
          className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          Continuer
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <h3 className="mb-1 text-sm font-bold text-card-foreground">Vous n'êtes pas connecté</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Créez un compte pour suivre vos commandes et gagner des avantages.
      </p>

      {/* Confirmation overlay */}
      {pendingAction && (
        <div className="mb-4 rounded-xl border-2 border-primary bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground mb-3">
            {pendingAction === "guest" && "Continuer sans compte ?"}
            {pendingAction === "signup" && "Créer un nouveau compte ?"}
            {pendingAction === "login" && "Aller à la page de connexion ?"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingAction(null)}
              className="flex-1 rounded-lg border bg-card py-2.5 text-sm font-semibold text-foreground"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
            >
              Confirmer
            </button>
          </div>
        </div>
      )}

      {!pendingAction && (
        <div className="space-y-2">
          <button onClick={() => setPendingAction("guest")} className="flex w-full items-center gap-3 rounded-xl border bg-secondary/50 px-4 py-3 text-left hover:bg-secondary">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">Continuer en invité</p>
              <p className="text-xs text-muted-foreground">Commander sans compte</p>
            </div>
          </button>
          <button onClick={() => setPendingAction("signup")} className="flex w-full items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 text-left">
            <UserPlus className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-primary">Créer un compte</p>
              <p className="text-xs text-muted-foreground">Suivez vos commandes</p>
            </div>
          </button>
          <button onClick={() => setPendingAction("login")} className="flex w-full items-center gap-3 rounded-xl border bg-secondary/50 px-4 py-3 text-left hover:bg-secondary">
            <LogIn className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">Se connecter</p>
              <p className="text-xs text-muted-foreground">J'ai déjà un compte</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default GuestPrompt;
