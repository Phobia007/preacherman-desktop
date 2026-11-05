import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const errors = [];
let total = 0;
const secretPatterns = [
  ["provider-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g],
  ["github-token", /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/g],
  ["aws-key-id", /\bAKIA[A-Z0-9]{16}\b/g],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{64,}/g],
];
function inspect(file, bytes) {
  if (bytes.length > 8 * 1024 * 1024 || bytes.subarray(0, 4096).includes(0)) return;
  const content = bytes.toString("utf8");
  for (const [kind, pattern] of secretPatterns) {
    for (const match of content.matchAll(pattern)) {
      // This exact alphabet-only credential is a redaction regression fixture.
      if (file.endsWith("tests/state-engine-decoupled.test.mjs") && createHash("sha256").update(match[0]).digest("hex") === "82be8a4d9cdebab78235e6d0618fdea34065fcb6f498073283ff4ec7376e551a") continue;
      // Obvious synthetic test fixtures, never a blanket exception by directory.
      if (/example|placeholder|your[_-]|test[_-]|dummy|fake|0{16}|1{16}|a{16}|x{16}/i.test(match[0])) continue;
      errors.push({ file, kind }); break;
    }
  }
  for (const token of content.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(token[1], "base64url").toString()).role === "service_role") errors.push({ file, kind: "supabase-service-role" }); } catch {}
  }
}
for (const file of files) {
  if (/(?:^|\/)(?:\.env(?:\..+)?|\.preacherman-demo|node_modules|deployment-backups|\.remotion)(?:\/|$)/.test(file) && !/\.env(?:\..+)?\.(example|sample)$/.test(file)) errors.push({ file, kind: "private-or-generated-path" });
  if (/\.breeze$|(?:^|\/)(?:execution-connections|characters|state-engine-decoupled)\.v1\.json$/.test(file)) errors.push({ file, kind: "private-state" });
  let data;
  try { const absolute = resolve(root, file); const stat = statSync(absolute); total += stat.size; if (stat.size > 100 * 1024 * 1024) errors.push({ file, kind: "over-100-MiB" }); data = readFileSync(absolute); }
  catch { continue; } // staged deletions
  inspect(file, data);
}
// Scan newly reachable historical text blobs as well as the final tree. Never
// print matched values. The public remote is the baseline, not all local refs.
let historical = 0;
if (process.argv.includes("--history")) {
  const objects = git(["rev-list", "--objects", "desktop/main..HEAD"]).trim().split("\n");
  for (const line of objects) {
    const match = /^([a-f0-9]{40}) (.+)$/.exec(line); if (!match) continue;
    const [, id, file] = match;
    if (!/\.(?:mjs|cjs|js|jsx|ts|tsx|py|ps1|sh|md|json|yml|yaml|toml|env|txt)$/.test(file)) continue;
    const type = git(["cat-file", "-t", id]).trim(); if (type !== "blob") continue;
    const size = Number(git(["cat-file", "-s", id]));
    if (size > 100 * 1024 * 1024) errors.push({ file, kind: "historical-over-100-MiB" });
    if (size <= 8 * 1024 * 1024) { inspect(`history:${file}`, Buffer.from(git(["cat-file", "blob", id]))); historical++; }
  }
}
const findings = [...new Map(errors.map(item => [JSON.stringify(item), item])).values()];
console.log(JSON.stringify({ trackedFiles: files.length, trackedBytes: total, historicalTextBlobs: historical, findings, passed: !findings.length }, null, 2));
process.exitCode = findings.length ? 1 : 0;
