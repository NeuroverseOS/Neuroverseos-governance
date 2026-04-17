#!/bin/bash
# ────────────────────────────────────────────────────────────────
# Radiant weekly read — run this on a schedule or manually
#
# Runs radiant emergent on the configured scope, writes the Memory
# Palace read to the exocortex. Next Claude Code session picks it
# up automatically.
#
# Setup:
#   1. Set your tokens in ~/.zshrc (one time)
#   2. Edit the variables below to match your paths
#   3. Run manually: bash radiant-read.sh
#   4. Or schedule weekly: crontab -e, then add:
#      0 8 * * 1 bash ~/path/to/radiant-read.sh
#
# The Memory Palace write-back creates:
#   exocortex/radiant/reads/YYYY-MM-DD.md   (this read)
#   exocortex/radiant/knowledge.md          (accumulated patterns)
# ────────────────────────────────────────────────────────────────

set -e

# ─── Configure these ────────────────────────────────────────────

# Where the governance repo lives (with dist/ built)
GOVERNANCE_DIR="${GOVERNANCE_DIR:-$HOME/Neuroverseos-governance}"

# What to analyze — org-level or specific repo
SCOPE="${RADIANT_SCOPE:-aukilabs/}"

# Lens to use
LENS="${RADIANT_LENS:-auki-builder}"

# Where the worldmodels live
WORLDS="${RADIANT_WORLDS:-$GOVERNANCE_DIR/src/radiant/examples/auki/worlds/}"

# Where the exocortex lives (reads + writes)
EXOCORTEX="${RADIANT_EXOCORTEX:-$HOME/exocortex}"

# View level: community | team | full
VIEW="${RADIANT_VIEW:-team}"

# ─── Run ────────────────────────────────────────────────────────

echo "Radiant read: $SCOPE (view: $VIEW)"
echo "ExoCortex: $EXOCORTEX"
echo ""

cd "$GOVERNANCE_DIR"

node dist/cli/neuroverse.js radiant emergent "$SCOPE" \
  --lens "$LENS" \
  --worlds "$WORLDS" \
  --exocortex "$EXOCORTEX" \
  --view "$VIEW"

echo ""
echo "────────────────────────────────────────────────"
echo "Read complete. Output written to:"
echo "  $EXOCORTEX/radiant/reads/$(date +%Y-%m-%d).md"
echo "  $EXOCORTEX/radiant/knowledge.md"
echo ""
echo "Next Claude Code session in any Auki repo will"
echo "read this automatically from the exocortex."
echo "────────────────────────────────────────────────"
