import { execFileSync } from "node:child_process";

const forbidden = [
  /(^|\/)(?:vault-data|runtime-data|output)\//i,
  /\.febcvault(?:\.|$)/i,
  /\.(?:vault|db|sqlite)(?:[-.]|$)/i,
  /(^|\/)\.env(?:\.|$)/i,
  /recovery-key.*\.txt$/i,
  /\.(?:key|pem|p12|pfx)$/i,
  /\.pdf$/i
];
const allowed = new Set([".env.example"]);

let tracked;
try {
  tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\0").filter(Boolean);
} catch {
  process.stdout.write("Repository safety check skipped until this directory is initialized as a Git repository.\n");
  process.exit(0);
}

const violations = tracked.filter((path) => !allowed.has(path) && forbidden.some((pattern) => pattern.test(path)));
if (violations.length) {
  process.stderr.write(`Refusing to continue because private/generated files are tracked:\n${violations.map((path) => `- ${path}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Repository safety check passed (${tracked.length} tracked files inspected).\n`);
