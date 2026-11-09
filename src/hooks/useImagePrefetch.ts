/**
 * Batch image prefetcher — Uber Eats pattern.
 * Preloads images via hidden <img> elements in micro-batches
 * using requestIdleCallback to avoid blocking the main thread.
 *
 * Usage:
 *   useImagePrefetch(imageUrls)  // call once when menu loads
 */

import { useEffect, useRef } from "react";

const BATCH_SIZE = 4;
const loaded = new Set<string>(); // global dedup across renders

export function prefetchImage(url: string): void {
  if (!url || loaded.has(url)) return;
  loaded.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

export function useImagePrefetch(urls: (string | null | undefined)[]) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const valid = urls.filter((u): u is string => !!u && !loaded.has(u));
    if (valid.length === 0) return;
    started.current = true;

    let i = 0;
    const next = () => {
      const batch = valid.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) return;
      batch.forEach(prefetchImage);
      i += BATCH_SIZE;
      if (i < valid.length) {
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(next);
        } else {
          setTimeout(next, 60);
        }
      }
    };
    // Start after first paint
    setTimeout(next, 80);
  }, [urls]);
}

/**
 * Supabase Storage image transform helper.
 * Appends render hints for on-the-fly WebP conversion + resize.
 */
export function optimizedUrl(
  url: string | null | undefined,
  width: number = 400,
  quality: number = 75,
): string {
  if (!url) return "";
  // Only transform Supabase Storage URLs
  if (url.includes("/storage/v1/object/public/")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}width=${width}&quality=${quality}&format=webp`;
  }
  return url;
}
