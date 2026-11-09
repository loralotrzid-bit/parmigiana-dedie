import { useEffect, useRef } from "react";

/**
 * Plays a LOUD, continuous, annoying alarm when there are pending orders.
 * Alternates between two tones to create urgency.
 * Stops when all orders are accepted (pendingCount === 0).
 */
export function useAdminNotificationSound(pendingCount: number) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Resume audio on any user gesture so browsers don't block it */
  useEffect(() => {
    const resume = () => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") ctx.resume();
    };
    document.addEventListener("click", resume, { passive: true });
    document.addEventListener("touchstart", resume, { passive: true });
    return () => {
      document.removeEventListener("click", resume);
      document.removeEventListener("touchstart", resume);
    };
  }, []);

  /* Re-resume when tab becomes visible again */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        const ctx = audioCtxRef.current;
        if (ctx && ctx.state === "suspended") ctx.resume();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (pendingCount > 0) {
      const playAlarm = async () => {
        try {
          if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
            audioCtxRef.current = new AudioContext();
          }
          const ctx = audioCtxRef.current;
          if (ctx.state === "suspended") {
            await ctx.resume();
          }
          const now = ctx.currentTime;

          // Tone 1 — high pitched urgent beep
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.type = "square";
          osc1.frequency.setValueAtTime(1200, now);
          gain1.gain.setValueAtTime(0.6, now);
          gain1.gain.setValueAtTime(0.6, now + 0.15);
          gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc1.start(now);
          osc1.stop(now + 0.2);

          // Tone 2 — lower beep (creates two-tone alarm effect)
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = "square";
          osc2.frequency.setValueAtTime(900, now + 0.25);
          gain2.gain.setValueAtTime(0, now);
          gain2.gain.setValueAtTime(0.6, now + 0.25);
          gain2.gain.setValueAtTime(0.6, now + 0.4);
          gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
          osc2.start(now + 0.25);
          osc2.stop(now + 0.45);

          // Tone 3 — repeat high for triple-beep urgency
          const osc3 = ctx.createOscillator();
          const gain3 = ctx.createGain();
          osc3.connect(gain3);
          gain3.connect(ctx.destination);
          osc3.type = "square";
          osc3.frequency.setValueAtTime(1200, now + 0.5);
          gain3.gain.setValueAtTime(0, now);
          gain3.gain.setValueAtTime(0.6, now + 0.5);
          gain3.gain.setValueAtTime(0.6, now + 0.65);
          gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
          osc3.start(now + 0.5);
          osc3.stop(now + 0.7);
        } catch {
          // AudioContext may fail in some environments
        }
      };

      playAlarm();
      // Repeat every 2 seconds — very frequent and annoying
      intervalRef.current = setInterval(playAlarm, 2000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pendingCount]);
}
