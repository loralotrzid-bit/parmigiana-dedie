import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        const isKnownZodAnnotationWarning =
          warning.code === "INVALID_ANNOTATION" &&
          warning.id?.replaceAll("\\", "/").includes("/node_modules/zod/v4/core/") &&
          warning.message.includes("contains an annotation that Rollup cannot interpret");
        if (isKnownZodAnnotationWarning) return;
        defaultHandler(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "framework";
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "supabase";
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return "query";
        },
      },
    },
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      workbox: {
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/auth\/callback/,
          /^\/rest\//,
          /^\/auth\//,
          /^\/functions\//,
          /^\/orders/,
          /^\/cart/,
          /^\/user/,
          /^\/account/,
        ],
        // Only cache static assets — NEVER cache API responses or auth tokens
        // Keep first install light: route-level JS chunks are cached only when visited below.
        globPatterns: ["**/*.{css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // BLOCK: never cache API/auth/functions endpoints
            urlPattern: /\/rest\/|\/auth\/|\/functions\//,
            handler: "NetworkOnly",
          },
          {
            // JS/CSS bundles — revalidate in background
            urlPattern: /\.(?:js|css)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "app-shell",
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // Static assets (images/fonts) — cache-first
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: false,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
