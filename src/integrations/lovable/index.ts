// Version autonome (sans Lovable) : connexion Google / Apple directement via Supabase Auth.
// Activez les fournisseurs Google et Apple dans Supabase > Authentication > Providers.
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple", opts?: SignInOptions) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri ?? `${window.location.origin}/auth/callback`,
          queryParams: opts?.extraParams,
        },
      });
      if (error) return { error };
      return { redirected: true as const, data };
    },
  },
};
