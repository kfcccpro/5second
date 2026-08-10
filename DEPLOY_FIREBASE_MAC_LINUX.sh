#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

echo "[1/5] Build content"
node tools/build-content.mjs

echo "[2/5] Validate content/runtime"
node tools/validate-content.mjs
node tools/audit-learning-content.mjs
node tools/validate-runtime.mjs
node tools/build-asset-manifest.mjs

echo "[3/5] Confirm Firebase project"
if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI is not installed. Run: npm install -g firebase-tools" >&2
  exit 1
fi
firebase use jk-english-5sec-grammar

echo "[4/5] Deploy Hosting only"
firebase deploy --only hosting

echo "[5/5] Finished"
echo "Deploy complete."
