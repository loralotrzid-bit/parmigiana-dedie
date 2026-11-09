import { useRef, useCallback } from "react";

/**
 * Plays a loud, attention-grabbing notification sound for new chat messages.
 * Triple-tone ascending melody — louder than before, impossible to miss.
 */
export function useChatNotificationSound() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playMessageSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;

      // Pop 1 — loud
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1046, now);        // C6
      osc1.frequency.setValueAtTime(1318, now + 0.06);  // E6
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.55, now + 0.015);
      gain1.gain.exponentialRampToValueAtTime(0.1, now + 0.12);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.start(now);
      osc1.stop(now + 0.2);

      // Pop 2 — higher, loud
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1568, now + 0.15);  // G6
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(0.5, now + 0.165);
      gain2.gain.exponentialRampToValueAtTime(0.08, now + 0.3);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.4);

      // Pop 3 — highest, extra attention
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.type = "sine";
      osc3.frequency.setValueAtTime(2093, now + 0.35);  // C7
      gain3.gain.setValueAtTime(0, now + 0.35);
      gain3.gain.linearRampToValueAtTime(0.45, now + 0.365);
      gain3.gain.exponentialRampToValueAtTime(0.05, now + 0.5);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc3.start(now + 0.35);
      osc3.stop(now + 0.6);
    } catch {
      // AudioContext not supported — ignore
    }
  }, []);

  return playMessageSound;
}
