import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogIn, AlertTriangle, Shield } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { getTotpStatus, validateTotp } from "@/services/totpService";

// ── Client-side brute force protection ──────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

function getLoginAttempts(): { count: number; lockedUntil: number | null } {
  try {
    const raw = sessionStorage.getItem("admin_login_attempts");
    if (!raw) return { count: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: null };
  }
}

function setLoginAttempts(count: number, lockedUntil: number | null) {
  sessionStorage.setItem("admin_login_attempts", JSON.stringify({ count, lockedUntil }));
}

const AdminLogin = () => {
  const { signIn, isAdmin, isSuperAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(false);

  // Redirect once roles are resolved (after login or if already admin)
  useEffect(() => {
    if (!authLoading && isAdmin && (pendingRedirect || !needs2FA)) {
      navigate(isSuperAdmin ? "/super-admin" : "/admin", { replace: true });
    }
  }, [isAdmin, isSuperAdmin, authLoading, navigate, needs2FA, pendingRedirect]);

  // Check lockout on mount
  useEffect(() => {
    const { lockedUntil } = getLoginAttempts();
    if (lockedUntil && Date.now() < lockedUntil) {
      setLocked(true);
      startCountdown(lockedUntil);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCountdown = (until: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLockCountdown(remaining);
      if (remaining <= 0) {
        setLocked(false);
        setLoginAttempts(0, null);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check lockout
    const attempts = getLoginAttempts();
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
      setLocked(true);
      startCountdown(attempts.lockedUntil);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
      // Reset attempts on success
      setLoginAttempts(0, null);

      // Check if 2FA is enabled for this user
      try {
        const has2FA = await getTotpStatus();
        if (has2FA) {
          setNeeds2FA(true);
          setLoading(false);
          return;
        }
      } catch {
        // If TOTP check fails, proceed without 2FA
      }

      // No 2FA — let useEffect handle redirect based on role
      setPendingRedirect(true);
    } catch {
      const newCount = (attempts.count || 0) + 1;
      if (newCount >= MAX_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCKOUT_DURATION;
        setLoginAttempts(newCount, lockedUntil);
        setLocked(true);
        startCountdown(lockedUntil);
        setError(null);
      } else {
        setLoginAttempts(newCount, null);
        setError("Identifiants incorrects");
      }
      setLoading(false);
    }
  };

  const handle2FAVerify = async () => {
    if (totpCode.length !== 6) return;
    setVerifying2FA(true);
    setError(null);

    try {
      const valid = await validateTotp(totpCode);
      if (valid) {
        setNeeds2FA(false);
        setPendingRedirect(true);
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Code incorrect");
    } finally {
      setVerifying2FA(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-3xl font-extrabold text-primary">RZ</span>
          <span className="text-2xl font-bold text-foreground">Admin</span>
          <p className="mt-2 text-sm text-muted-foreground">
            {needs2FA ? "Vérification en deux étapes" : "Connectez-vous pour gérer vos commandes"}
          </p>
        </div>

        {locked ? (
          <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
            <p className="text-sm font-bold text-destructive">Compte temporairement verrouillé</p>
            <p className="text-xs text-muted-foreground">
              Trop de tentatives échouées. Réessayez dans{" "}
              <span className="font-mono font-bold text-foreground">{formatTime(lockCountdown)}</span>
            </p>
          </div>
        ) : needs2FA ? (
          /* ── 2FA Verification Step ── */
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-6 text-center space-y-4">
              <Shield className="mx-auto h-10 w-10 text-primary" />
              <p className="text-sm text-muted-foreground">
                Entrez le code à 6 chiffres de votre application d'authentification
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                autoFocus
                className="mx-auto block w-40 rounded-xl border bg-background px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => { if (e.key === "Enter") handle2FAVerify(); }}
              />

              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}

              <button
                onClick={handle2FAVerify}
                disabled={totpCode.length !== 6 || verifying2FA}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {verifying2FA ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Vérifier
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => { setNeeds2FA(false); setTotpCode(""); setError(null); }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              ← Retour à la connexion
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border bg-card px-4 py-3 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin@restaurant.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border bg-card px-4 py-3 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Se connecter
                </>
              )}
            </button>
            <p className="mt-3 text-center">
              <a href="/auth/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                Mot de passe oublié ?
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default AdminLogin;
