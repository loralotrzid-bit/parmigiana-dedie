import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import ClientLayout from "@/layouts/ClientLayout";
import ProfileCompletion from "@/components/client/ProfileCompletion";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSession, isValidSession } from "@/lib/authSession";

const DEFAULT_NEXT = "/cart?step=profile";

const sanitizeNextPath = (value: string | null): string => {
  if (!value || !value.startsWith("/")) return DEFAULT_NEXT;
  if (value.startsWith("/auth")) return DEFAULT_NEXT;
  return value;
};

const CompleteProfile = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [resolving, setResolving] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  const nextPath = useMemo(() => {
    const fromQuery = searchParams.get("next");
    return sanitizeNextPath(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const current = await getCurrentSession({
        allowRefresh: true,
        allowStorageFallback: true,
      });

      if (!isValidSession(current)) {
        if (!cancelled) {
          navigate("/cart", { replace: true });
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, phone")
        .eq("user_id", current.user.id)
        .maybeSingle();

      if (cancelled) return;

      const complete = !!profile?.display_name?.trim() && !!profile?.phone?.trim();
      if (complete) {
        navigate(nextPath, { replace: true });
        return;
      }

      setSession(current);
      setResolving(false);
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [navigate, nextPath]);

  if (resolving || !session) {
    return (
      <ClientLayout>
        <div className="flex min-h-[60dvh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="animate-fade-in px-4 pt-4 pb-10">
        <h1 className="mb-2 text-xl font-extrabold text-foreground">Finaliser votre profil</h1>
        <p className="mb-4 text-sm text-muted-foreground">Complétez vos infos une seule fois pour continuer la commande.</p>

        <ProfileCompletion
          onComplete={() => {
            navigate(nextPath, { replace: true });
          }}
          isDelivery={false}
          sessionHint={session}
        />
      </div>
    </ClientLayout>
  );
};

export default CompleteProfile;
