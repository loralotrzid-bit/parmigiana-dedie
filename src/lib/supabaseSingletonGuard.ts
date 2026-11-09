import { supabase } from "@/integrations/supabase/client";
import { dbg } from "@/lib/debugLog";

declare global {
  interface Window {
    __rzfood_supabase_singleton_guard_count__?: number;
  }
}

if (typeof window !== "undefined") {
  window.__rzfood_supabase_singleton_guard_count__ =
    (window.__rzfood_supabase_singleton_guard_count__ ?? 0) + 1;

  dbg(
    "supabase",
    "Supabase singleton guard import",
    {
      count: window.__rzfood_supabase_singleton_guard_count__,
      hasAuthApi: !!supabase?.auth,
    },
    window.__rzfood_supabase_singleton_guard_count__ === 1 ? "success" : "fail"
  );
}

export {};
