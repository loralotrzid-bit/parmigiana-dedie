import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/contexts/useAuth";

interface ResolvedAuthUserState {
  user: User | null;
  isLoading: boolean;
}

export function useResolvedAuthUser(): ResolvedAuthUserState {
  const { user, isLoading } = useAuth();
  return { user, isLoading };
}
