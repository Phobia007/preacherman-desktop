#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo "Run this setup on macOS." >&2
  exit 1
fi
for tool in node npm cargo rustc; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
xcode-select -p >/dev/null
node --input-type=module -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) throw new Error("Node 22.12 or newer is required");'

# The host uses file: dependencies. Build these before npm ci in the host,
# otherwise presentation-runtime's prepare hook cannot find TypeScript.
for package in preacherman-presentation-runtime preacherman-avatar-renderer preacherman-surface-skin; do
  npm --prefix "packages/$package" ci --no-audit --no-fund
  npm --prefix "packages/$package" run build
done
npm --prefix apps/preacherman-demo-host ci --no-audit --no-fund
npm --prefix apps/preacherman-demo-host run typecheck
echo 'Ready. Desktop development: cd apps/preacherman-demo-host && npm run tauri:dev'
echo 'Native app bundle: cd apps/preacherman-demo-host && npm run build:macos'
