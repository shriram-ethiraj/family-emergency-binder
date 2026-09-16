import { createHash } from "node:crypto";
import { readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const packageName = "family-emergency-binder";
const dist = resolve(root, "dist");
const html = resolve(dist, packageName, `${packageName}.html`);
const archiveName = `${packageName}-v${version}.zip`;
const archive = resolve(dist, archiveName);
const checksum = `${archive}.sha256`;
const maximumHtmlBytes = 1.25 * 1024 * 1024;
const maximumArchiveBytes = 2.5 * 1024 * 1024;

for (const path of [archive, checksum]) {
  try { unlinkSync(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}

const htmlBytes = statSync(html).size;
if (htmlBytes > maximumHtmlBytes) throw new Error(`HTML is ${htmlBytes} bytes; limit is ${maximumHtmlBytes}`);

const zipped = spawnSync("zip", ["-q", "-r", "-9", archiveName, packageName], { cwd: dist, encoding: "utf8" });
if (zipped.status !== 0) throw new Error(zipped.stderr || "zip failed");
const archiveBytes = statSync(archive).size;
if (archiveBytes > maximumArchiveBytes) throw new Error(`ZIP is ${archiveBytes} bytes; limit is ${maximumArchiveBytes}`);
const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(checksum, `${digest}  ${archiveName}\n`, { encoding: "utf8", mode: 0o644 });
console.log(`HTML: ${(htmlBytes / 1024).toFixed(1)} KiB`);
console.log(`ZIP: ${(archiveBytes / 1024).toFixed(1)} KiB`);
console.log(`SHA-256: ${digest}`);
