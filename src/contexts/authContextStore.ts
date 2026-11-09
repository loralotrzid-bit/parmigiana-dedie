import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  restaurantId: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  impersonateRestaurant: (restaurantId: string) => void;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);
