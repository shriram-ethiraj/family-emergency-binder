import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const require = createRequire(import.meta.url);
const root = import.meta.dirname;
const PDFMAKE_ASSET = "assets/pdfmake.min.js";
const PDF_FONTS_ASSET = "assets/noto-sans-vfs.js";
const MAX_HTML_BYTES = 1.25 * 1024 * 1024;

function portableBundle(): Plugin {
  const pdfMakeSource = readFileSync(require.resolve("pdfmake/build/pdfmake.min.js"), "utf8");
  const fontDirectory = resolve(root, "definitions/assets/fonts");
  const fontNames = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf", "NotoSans-Italic.ttf", "NotoSans-BoldItalic.ttf"];
  const vfs = Object.fromEntries(fontNames.map((name) => [name, readFileSync(resolve(fontDirectory, name)).toString("base64")]));
  const fontSource = `globalThis.__FEBC_PDF_FONTS__=${JSON.stringify({ vfs, fonts: { NotoSans: { normal: fontNames[0], bold: fontNames[1], italics: fontNames[2], bolditalics: fontNames[3] } } })};`;
  const dependencyTags = `<script src="./${PDFMAKE_ASSET}"></script><script src="./${PDF_FONTS_ASSET}"></script>`;

  return {
    name: "family-binder-portable-bundle",
    enforce: "post",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?", 1)[0];
        if (path !== `/${PDFMAKE_ASSET}` && path !== `/${PDF_FONTS_ASSET}`) return next();
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(path === `/${PDFMAKE_ASSET}` ? pdfMakeSource : fontSource);
      });
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        return context.server ? html.replace("</head>", `${dependencyTags}</head>`) : html;
      },
    },
    buildStart() {
      this.emitFile({ type: "asset", fileName: PDFMAKE_ASSET, source: pdfMakeSource });
      this.emitFile({ type: "asset", fileName: PDF_FONTS_ASSET, source: fontSource });
      for (const file of templateFiles(resolve(root, "definitions/templates"))) {
        const path = relative(resolve(root, "definitions/templates"), file).replaceAll("\\", "/");
        this.emitFile({ type: "asset", fileName: `templates/${path}`, source: readFileSync(file) });
      }
      this.emitFile({ type: "asset", fileName: "README.txt", source: readFileSync(resolve(root, "packaging/README.txt")) });
    },
    generateBundle(_options, bundle) {
      const candidate = Object.values(bundle).find((item) => item.type === "asset" && item.fileName.endsWith(".html"));
      if (!candidate || candidate.type !== "asset" || typeof candidate.source !== "string") throw new Error("Vite did not emit an HTML entrypoint");
      const htmlAsset = candidate;
      let html = String(htmlAsset.source);
      const scripts: string[] = [];
      html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g, (tag, source: string) => {
        const fileName = source.replace(/^\.\//, "").replace(/^\//, "");
        const item = bundle[fileName];
        if (!item || item.type !== "chunk") return tag;
        scripts.push(item.code);
        delete bundle[fileName];
        return `<script type="module">${item.code}`;
      });
      html = html.replace(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/g, (tag, source: string) => {
        const fileName = source.replace(/^\.\//, "").replace(/^\//, "");
        const item = bundle[fileName];
        if (!item || item.type !== "asset") return tag;
        const css = String(item.source);
        delete bundle[fileName];
        return `<style>${css}</style>`;
      });
      html = html.replace("</head>", `${dependencyTags}</head>`);
      const scriptHashes = scripts.map((value) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`).join(" ");
      const csp = `default-src 'none'; script-src 'self' ${scriptHashes}; style-src 'unsafe-inline'; img-src data: blob:; font-src 'self' data:; worker-src blob: data:; child-src blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
      html = html.replace(/<meta charset=["']UTF-8["']\s*\/?\s*>/i, (tag) => `${tag}<meta http-equiv="Content-Security-Policy" content="${csp}">`);
      if (!html.includes("Content-Security-Policy")) throw new Error("Content Security Policy was not injected");
      const htmlBytes = Buffer.byteLength(html);
      if (htmlBytes > MAX_HTML_BYTES) throw new Error(`Portable HTML is ${htmlBytes} bytes; limit is ${MAX_HTML_BYTES} bytes`);
      htmlAsset.source = html;
      htmlAsset.fileName = "family-emergency-binder.html";

      for (const [fileName, item] of Object.entries(bundle)) {
        if (item === htmlAsset || fileName === PDFMAKE_ASSET || fileName === PDF_FONTS_ASSET || fileName === "README.txt" || fileName.startsWith("templates/") || fileName.endsWith(".woff2")) continue;
        throw new Error(`Unexpected external build asset: ${fileName}`);
      }
      console.info(`Portable HTML: ${(htmlBytes / 1024).toFixed(1)} KiB (limit ${(MAX_HTML_BYTES / 1024).toFixed(0)} KiB)`);
    },
  };
}

function templateFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return templateFiles(path);
    return entry.isFile() && extname(entry.name).toLowerCase() === ".json" ? [path] : [];
  }).sort();
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), portableBundle()],
  resolve: { alias: { "@": resolve(root, "src") } },
  assetsInclude: ["**/*.ttf"],
  worker: { format: "iife" },
  build: {
    outDir: "dist/family-emergency-binder",
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames(assetInfo) {
          const name = assetInfo.names[0] ?? "asset";
          return extname(name).toLowerCase() === ".woff2" ? `assets/${basename(name)}` : "assets/[name][extname]";
        },
      },
    },
  },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: Number(process.env.WEB_PORT ?? 4173) },
});
