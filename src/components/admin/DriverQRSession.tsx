import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QrCode, Loader2, Copy, Check, RefreshCw, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeToast } from "@/lib/safeToast";
import QRCode from "qrcode";

interface DriverQRSessionProps {
  restaurantId: string;
}

export default function DriverQRSession({ restaurantId }: DriverQRSessionProps) {
  const queryClient = useQueryClient();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check for existing active session
  const { data: activeSession, isLoading: loadingSession } = useQuery({
    queryKey: ["driver-session", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_sessions")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; session_token: string; expires_at: string; restaurant_id: string } | null;
    },
    refetchInterval: 60_000, // Re-check every minute for expiration
  });

  // Generate QR code image when session exists
  const generateQrImage = async (token: string) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/delivery?session=${token}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
    } catch {
      safeToast.error("Erreur de génération du QR code");
    }
  };

  // Generate new session
  const generateMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("driver-session", {
        body: { action: "generate", restaurant_id: restaurantId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { session_token: string; expires_at: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["driver-session", restaurantId] });
      generateQrImage(data.session_token);
      safeToast.success("QR code livreur généré !");
    },
    onError: (error) => safeToast.error(error.message || "Erreur"),
  });

  // Show QR for existing session
  const showExistingQr = () => {
    if (activeSession?.session_token) {
      generateQrImage(activeSession.session_token);
    }
  };

  const copyLink = () => {
    if (!activeSession?.session_token) return;
    const url = `${window.location.origin}/delivery?session=${activeSession.session_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      safeToast.success("Lien copié !");
    });
  };

  const expiresAt = activeSession?.expires_at ? new Date(activeSession.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : true;
  const timeLeft = expiresAt
    ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000))
    : 0;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-card-foreground">Accès QR livreur</h3>
        </div>
        {activeSession && !isExpired && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Expire dans {timeLeft > 60 ? `${Math.round(timeLeft / 60)}h` : `${timeLeft}min`}</span>
          </div>
        )}
      </div>

      {loadingSession ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : activeSession && !isExpired ? (
        <div className="space-y-3">
          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-3">
              <img src={qrDataUrl} alt="QR Code livreur" className="mx-auto rounded-lg border" />
              <p className="text-center text-xs text-muted-foreground">
                Scannez ce QR code pour accéder à l'interface livreur
              </p>
            </div>
          ) : (
            <button
              onClick={showExistingQr}
              className="w-full rounded-lg border border-primary/30 bg-primary/5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <QrCode className="mr-2 inline h-4 w-4" />
              Afficher le QR code
            </button>
          )}

          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié !" : "Copier le lien"}
            </button>
            <button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generateMut.isPending ? "animate-spin" : ""}`} />
              Régénérer
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Générez un QR code quotidien pour que vos livreurs accèdent à leurs livraisons. La session expire automatiquement à la fermeture du restaurant ou après 24h.
          </p>
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {generateMut.isPending ? (
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="mr-2 inline h-4 w-4" />
            )}
            Générer le QR code du jour
          </button>
        </div>
      )}
    </div>
  );
}
