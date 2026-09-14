import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

const apiTarget = process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:4173";
const apiProxy = {
  "/api": {
    target: apiTarget,
    changeOrigin: false,
    secure: false,
  },
};
const securityHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router") || id.includes("/react/") || id.includes("/react-dom/")) return "react-vendor";
          if (id.includes("@tanstack")) return "query-vendor";
          if (id.includes("radix-ui") || id.includes("@radix-ui")) return "ui-vendor";
          if (id.includes("react-hook-form") || id.includes("@hookform") || id.includes("/zod/")) return "forms-vendor";
          if (id.includes("lucide-react")) return "icons-vendor";
        }
      }
    }
  },
  server: {
    host: process.env.DOCKER_DEV === "true" ? "0.0.0.0" : "127.0.0.1",
    port: 5173,
    watch: {
      usePolling: process.env.DOCKER_DEV === "true",
      interval: 250
    },
    proxy: apiProxy,
  },
  preview: {
    host: process.env.DOCKER_DEV === "true" ? "0.0.0.0" : "127.0.0.1",
    port: Number(process.env.WEB_PORT ?? 4173),
    proxy: apiProxy,
    headers: securityHeaders,
  }
});
