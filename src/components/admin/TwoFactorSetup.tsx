import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { safeToast } from "@/lib/safeToast";
import { setupTotp, verifyTotpSetup, disableTotp, getTotpStatus } from "@/services/totpService";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const TwoFactorSetup = () => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"idle" | "setup" | "verify" | "disable">("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: isEnabled, isLoading } = useQuery({
    queryKey: ["totp-status"],
    queryFn: getTotpStatus,
  });

  const handleSetup = async () => {
    setLoading(true);
    try {
      const data = await setupTotp();
      setSecret(data.secret);
      setOtpauthUri(data.otpauth_uri);
      // Generate QR code client-side — NEVER send secret to external API
      try {
        const dataUrl = await QRCode.toDataURL(data.otpauth_uri, { width: 200, margin: 2 });
        setQrDataUrl(dataUrl);
      } catch { /* QR generation failed, user can still copy secret manually */ }
      setStep("setup");
    } catch (error: unknown) {
      safeToast.error(error instanceof Error ? error.message : "Erreur lors de la configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (token.length !== 6) return;
    setLoading(true);
    try {
      await verifyTotpSetup(token);
      safeToast.success("2FA activé avec succès !");
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      setStep("idle");
      setToken("");
      setSecret(null);
      setOtpauthUri(null);
      setQrDataUrl(null);
    } catch (error: unknown) {
      safeToast.error(error instanceof Error ? error.message : "Code incorrect");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (token.length !== 6) return;
    setLoading(true);
    try {
      await disableTotp(token);
      safeToast.success("2FA désactivé");
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      setStep("idle");
      setToken("");
    } catch (error: unknown) {
      safeToast.error(error instanceof Error ? error.message : "Code incorrect");
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isEnabled ? (
            <ShieldCheck className="h-5 w-5 text-success" />
          ) : (
            <Shield className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              Authentification à deux facteurs (2FA)
            </p>
            <p className="text-xs text-muted-foreground">
              {isEnabled
                ? "Activé — votre compte est protégé"
                : "Désactivé — activez pour plus de sécurité"}
            </p>
          </div>
        </div>

        {step === "idle" && (
          <button
            onClick={isEnabled ? () => setStep("disable") : handleSetup}
            disabled={loading}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isEnabled
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            } disabled:opacity-50`}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isEnabled ? (
              <>
                <ShieldOff className="h-3.5 w-3.5" /> Désactiver
              </>
            ) : (
              <>
                <Shield className="h-3.5 w-3.5" /> Activer
              </>
            )}
          </button>
        )}
      </div>

      {/* Setup step — show secret */}
      {step === "setup" && secret && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">
              1. Scannez le QR code ou copiez la clé
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Ouvrez votre application d'authentification (Google Authenticator, Authy, etc.) et ajoutez un nouveau compte.
            </p>

            {/* QR Code generated client-side — secret never leaves the browser */}
            {qrDataUrl && (
              <div className="flex justify-center mb-3">
                <img
                  src={qrDataUrl}
                  alt="QR Code 2FA"
                  className="rounded-lg border"
                  width={200}
                  height={200}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs font-mono text-foreground break-all">
                {secret}
              </code>
              <button
                onClick={copySecret}
                className="rounded-lg bg-muted p-2 text-muted-foreground hover:text-foreground transition-colors"
                title="Copier"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground mb-2">
              2. Entrez le code à 6 chiffres
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-32 rounded-lg border bg-background px-3 py-2 text-center text-lg font-mono tracking-widest text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleVerify}
                disabled={token.length !== 6 || loading}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vérifier"}
              </button>
            </div>
          </div>

          <button
            onClick={() => { setStep("idle"); setSecret(null); setQrDataUrl(null); setToken(""); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Disable step — require current code */}
      {step === "disable" && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">
            Entrez votre code 2FA pour confirmer la désactivation
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-32 rounded-lg border bg-background px-3 py-2 text-center text-lg font-mono tracking-widest text-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
            />
            <button
              onClick={handleDisable}
              disabled={token.length !== 6 || loading}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Désactiver"}
            </button>
          </div>
          <button
            onClick={() => { setStep("idle"); setToken(""); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
};

export default TwoFactorSetup;
