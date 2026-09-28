#!/bin/bash
# Section 4 of the govern-my-chatbot audit: governed chatbot (arm B) vs. prompt only (A) vs. keywords (C).
# Needs ANTHROPIC_API_KEY in the environment (never printed). Cheapest-model mode: Haiku 4.5 everywhere.
# Stops at BUDGET_USD (default 5). SAMPLE=3 runs a third of the cases (~$1).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../../.." && pwd)
[ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "ANTHROPIC_API_KEY is not set in this environment."; exit 2; }
# Claude Code cloud sessions set ANTHROPIC_BASE_URL to their own internal endpoint; this test
# must call the public API with the owner's key. SECTION4_BASE_URL overrides (e.g. a local mock).
export ANTHROPIC_BASE_URL="${SECTION4_BASE_URL:-https://api.anthropic.com}"
cd "$REPO" && npm ci --silent && npm run build --silent >/dev/null
TGZ=$(npm pack --silent --pack-destination /tmp | tail -1)
APP="$HERE/app"; mkdir -p "$APP" && cd "$APP"
[ -f package.json ] || { npm init -y >/dev/null; npm pkg set type=module >/dev/null; }
npm install --silent "/tmp/$TGZ" @anthropic-ai/sdk tsx
cp "$REPO/skills/govern-my-chatbot/templates/claude-models.ts" .   # the template's checker, unchanged
cp "$HERE/run-ab.ts" "$HERE/cases.json" . && rm -rf rulebooks && cp -r "$HERE/rulebooks" .
npx tsx run-ab.ts 2> run.log || { tail -20 run.log; exit 1; }
mkdir -p "$HERE/results" && cp -r out/. "$HERE/results/" && cp run.log "$HERE/results/"
node "$HERE/metrics.mjs" "$HERE/results" > "$HERE/results/metrics.md"
cat "$HERE/results/metrics.md"
echo; echo "Results: $HERE/results (metrics.md, results.jsonl, usage.json, spotcheck.csv)"
