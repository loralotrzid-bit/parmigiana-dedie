import { useState, useEffect } from "react";
import { UserPlus, X, Mail, Phone } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";

interface PostOrderSignupProps {
  orderId: string;
  onDismiss: () => void;
}

const PostOrderSignup = ({ orderId, onDismiss }: PostOrderSignupProps) => {
  const [dismissed, setDismissed] = useState(false);
  const { user, isLoading } = useAuth();
  const isAnonymous = !user || user.is_anonymous === true;

  void orderId;

  if (isLoading || !isAnonymous || dismissed) return null;

  const alreadyDismissed = sessionStorage.getItem("rzfood_signup_dismissed");
  if (alreadyDismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem("rzfood_signup_dismissed", "1");
    setDismissed(true);
    onDismiss();
  };

  return (
    <div className="mt-6 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 animate-fade-in">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Créez votre compte</h3>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Créez votre compte pour profiter de récompenses et offres spéciales.
      </p>

      <div className="space-y-2">
        <a
          href="/auth/signup"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          <Mail className="h-4 w-4" />
          Créer un compte par email
        </a>
        <a
          href="/auth/login"
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold text-foreground"
        >
          J'ai déjà un compte
        </a>
      </div>
    </div>
  );
};

export default PostOrderSignup;
