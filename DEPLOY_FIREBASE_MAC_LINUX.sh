#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI is not installed. Run: npm install -g firebase-tools" >&2
  exit 1
fi
firebase login
firebase use --add
firebase deploy --only firestore:rules,hosting
