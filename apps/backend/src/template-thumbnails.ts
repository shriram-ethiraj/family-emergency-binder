import { randomUUID } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import type { TemplateDefinition } from "./types.js";
import { renderPdf } from "./pdf.js";

export const THUMBNAIL_RENDERER_VERSION = "1";
export const THUMBNAIL_WIDTH = 1200;
export const THUMBNAIL_HEIGHT = 900;

interface CanvasSurface {
  canvas: any;
  context: any;
}

class PdfCanvasFactory {
  create(width: number, height: number): CanvasSurface {
    const canvas: any = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(surface: CanvasSurface, width: number, height: number): void {
    surface.canvas.width = Math.ceil(width);
    surface.canvas.height = Math.ceil(height);
  }
  destroy(surface: CanvasSurface): void {
    surface.canvas.width = 1;
    surface.canvas.height = 1;
  }
}

export async function prepareTemplateThumbnail(args: {
  template: TemplateDefinition;
  assetRoot: string;
  cacheDir: string;
  hash: string;
}): Promise<string> {
  const target = join(args.cacheDir, "thumbnails", args.template.templateId, args.template.version, `${args.hash}-${THUMBNAIL_RENDERER_VERSION}.png`);
  try {
    await access(target);
    return target;
  } catch {
    // A missing or stale thumbnail is regenerated below.
  }
  const buffer = await renderThumbnail(args.template, args.assetRoot);
  await mkdir(join(args.cacheDir, "thumbnails", args.template.templateId, args.template.version), { recursive: true, mode: 0o700 });
  const temporary = join(args.cacheDir, "thumbnails", `.${randomUUID()}.png`);
  await writeFile(temporary, buffer, { mode: 0o600 });
  await rename(temporary, target);
  return target;
}

async function renderThumbnail(template: TemplateDefinition, assetRoot: string): Promise<Buffer> {
  const pdf = await renderPdf(template, {
    document: template.syntheticData,
    system: { generatedAt: "2000-01-01T00:00:00.000Z", documentRevision: 1, profileRevision: 1 }
  }, undefined, assetRoot);
  const canvasExports = globalThis as unknown as Record<string, unknown>;
  canvasExports.DOMMatrix ??= DOMMatrix;
  canvasExports.ImageData ??= ImageData;
  canvasExports.Path2D ??= Path2D;
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  const factory = new PdfCanvasFactory();
  const document = await getDocument({ data: new Uint8Array(pdf), disableWorker: true, canvasFactory: factory }).promise;
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const rendered = factory.create(viewport.width, viewport.height);
    await (page as any).render({ canvasContext: rendered.context, viewport, canvasFactory: factory }).promise;
    const thumbnail = createCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    const context = thumbnail.getContext("2d");
    context.fillStyle = "#eef1f5";
    context.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    const scale = Math.min(THUMBNAIL_WIDTH / rendered.canvas.width, THUMBNAIL_HEIGHT / rendered.canvas.height);
    const width = rendered.canvas.width * scale;
    const height = rendered.canvas.height * scale;
    context.drawImage(rendered.canvas, (THUMBNAIL_WIDTH - width) / 2, (THUMBNAIL_HEIGHT - height) / 2, width, height);
    factory.destroy(rendered);
    page.cleanup();
    return thumbnail.toBuffer("image/png");
  } finally {
    await document.destroy();
  }
}
