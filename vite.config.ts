import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

function singleHtml(): Plugin {
  return {
    name: "family-binder-single-html",
    enforce: "post",
    generateBundle(_options, bundle) {
      const candidate = Object.values(bundle).find((item) => item.type === "asset" && item.fileName.endsWith(".html"));
      if (!candidate || candidate.type !== "asset" || typeof candidate.source !== "string") throw new Error("Vite did not emit an HTML entrypoint");
      const htmlAsset = candidate;
      let html = String(htmlAsset.source);
      const scripts: string[] = [];
      const styles: string[] = [];
      html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g, (tag, source: string) => {
        const fileName = source.replace(/^\.\//, "").replace(/^\//, ""); const item = bundle[fileName];
        if (!item || item.type !== "chunk") return tag;
        scripts.push(item.code); delete bundle[fileName]; return `<script type="module">${item.code}`;
      });
      html = html.replace(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/g, (tag, source: string) => {
        const fileName = source.replace(/^\.\//, "").replace(/^\//, ""); const item = bundle[fileName];
        if (!item || item.type !== "asset") return tag;
        const css = String(item.source); styles.push(css); delete bundle[fileName]; return `<style>${css}</style>`;
      });
      for (const [fileName, item] of Object.entries(bundle)) if (item !== htmlAsset) throw new Error(`Unexpected external build asset: ${fileName}`);
      const external = html.match(/<script[^>]+src=[^>]*>|<link[^>]+stylesheet[^>]*>/)?.[0];
      if (external) throw new Error(`Single-file build retained an external asset: ${external}`);
      const hashes = [
        ...scripts.map((value) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`),
        ...styles.map((value) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`),
      ];
      const scriptHashes = hashes.slice(0, scripts.length).join(" ");
      // React, Radix, and pdfmake create runtime style elements and attributes for
      // positioning and measurement. Script execution remains hash-pinned;
      // allowing inline CSS cannot enable JavaScript or networking.
      const csp = `default-src 'none'; script-src ${scriptHashes}; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; worker-src blob: data:; child-src blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
      html = html.replace(/<meta charset=["']UTF-8["']\s*\/?\s*>/i, (tag) => `${tag}<meta http-equiv="Content-Security-Policy" content="${csp}">`);
      if (!html.includes("Content-Security-Policy")) throw new Error("Content Security Policy was not injected");
      htmlAsset.source = html; htmlAsset.fileName = "family-emergency-binder.html";
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), singleHtml()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  assetsInclude: ["**/*.ttf"],
  // Classic Blob workers retain a usable origin when the parent was opened from
  // file://. Chromium rejects the module-worker bootstrap in that situation.
  worker: { format: "iife" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: Number(process.env.WEB_PORT ?? 4173) },
});
