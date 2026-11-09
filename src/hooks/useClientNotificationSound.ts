import { useEffect, useRef, useCallback } from "react";

/**
 * Play a notification sound when order status changes to specific states.
 * Uses Web Audio API — no external sound files needed.
 */
export function useClientNotificationSound(status: string | undefined) {
  const prevStatusRef = useRef<string | undefined>(undefined);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playSound = useCallback((type: "ready" | "driver") => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === "ready") {
        // Cheerful double beep for "order ready"
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
        oscillator.frequency.setValueAtTime(1320, ctx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
      } else {
        // Gentle ascending tone for "driver en route"
        oscillator.frequency.setValueAtTime(523, ctx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(784, ctx.currentTime + 0.3);
        oscillator.frequency.linearRampToValueAtTime(1047, ctx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.6);
      }
    } catch {
      // AudioContext not supported or blocked — ignore
    }
  }, []);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (!prev || !status || prev === status) return;

    // Order is ready
    if (status === "ready" && prev !== "ready") {
      playSound("ready");
    }

    // Driver is en route
    if (status === "in_delivery" && prev !== "in_delivery") {
      playSound("driver");
    }
  }, [status, playSound]);
}
