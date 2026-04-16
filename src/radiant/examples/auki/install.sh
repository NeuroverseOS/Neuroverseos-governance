#!/bin/bash
set -e

# ────────────────────────────────────────────────────────────────────────────
# Radiant for Auki — Install Script
#
# Drops the Auki Claude Code bundle into a target repo. After running this,
# every Claude Code session in that repo starts with Auki's worldmodels,
# voice rules, and invariants in context.
#
# Usage:
#   bash install.sh                    # installs into current directory
#   bash install.sh /path/to/repo      # installs into specified repo
#
# What it does:
#   1. Copies CLAUDE.md into the target repo root
#   2. Creates .claude/ directory if it doesn't exist
#   3. Copies compiled Auki worldmodels into ./worlds/
#   4. Prints next steps
#
# What it does NOT do:
#   - Install npm packages (you need @neuroverseos/governance installed
#     separately if you want to use `neuroverse radiant think`)
#   - Set up API keys (set ANTHROPIC_API_KEY in your shell profile)
#   - Modify existing CLAUDE.md (refuses if one already exists)
# ────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-.}"
TARGET="$(cd "$TARGET" && pwd)"

echo "Radiant for Auki — installing into: $TARGET"
echo ""

# ─── Check for existing CLAUDE.md ──────────────────────────────────────────

if [ -f "$TARGET/CLAUDE.md" ]; then
  echo "⚠  CLAUDE.md already exists in $TARGET."
  echo "   Refusing to overwrite. To update manually, compare with:"
  echo "   $SCRIPT_DIR/CLAUDE.md"
  echo ""
else
  cp "$SCRIPT_DIR/CLAUDE.md" "$TARGET/CLAUDE.md"
  echo "✓  Copied CLAUDE.md"
fi

# ─── Create .claude/ directory ─────────────────────────────────────────────

mkdir -p "$TARGET/.claude"
echo "✓  .claude/ directory ready"

# ─── Copy compiled worldmodels ─────────────────────────────────────────────

mkdir -p "$TARGET/worlds"

# Copy source worldmodels (the ones the worldmodel compiler reads)
WORLDS_SRC="$SCRIPT_DIR/../../../../src/worlds"
if [ -d "$WORLDS_SRC" ]; then
  for f in "$WORLDS_SRC"/auki-*.worldmodel.md; do
    if [ -f "$f" ]; then
      cp "$f" "$TARGET/worlds/"
      echo "✓  Copied $(basename "$f") to worlds/"
    fi
  done
fi

# Also copy the strategy worldmodel from radiant/src/worlds/ if present
RADIANT_WORLDS_SRC="$SCRIPT_DIR/../../../../radiant/src/worlds"
if [ -d "$RADIANT_WORLDS_SRC" ]; then
  for f in "$RADIANT_WORLDS_SRC"/auki-*.worldmodel.md; do
    if [ -f "$f" ]; then
      cp "$f" "$TARGET/worlds/"
      echo "✓  Copied $(basename "$f") to worlds/"
    fi
  done
fi

# ─── Done ──────────────────────────────────────────────────────────────────

echo ""
echo "────────────────────────────────────────────────────"
echo "Radiant for Auki installed."
echo ""
echo "Every Claude Code session in this repo now starts"
echo "with Auki's worldmodels and voice rules in context."
echo ""
echo "Next steps:"
echo ""
echo "  1. Open this repo in Claude Code (CLI, VS Code, or JetBrains)."
echo "     Claude will read CLAUDE.md automatically."
echo ""
echo "  2. (Optional) For deeper Radiant integration, install the package:"
echo "     npm install @neuroverseos/governance"
echo ""
echo "  3. (Optional) Set your API key for radiant think:"
echo "     export ANTHROPIC_API_KEY=your-key-here"
echo "     npx @neuroverseos/governance radiant think \\"
echo "       --lens auki-builder --worlds ./worlds/ \\"
echo "       --query \"What is our biggest strategic risk?\""
echo ""
echo "  4. (Optional) List available lenses:"
echo "     npx @neuroverseos/governance radiant lenses list"
echo "────────────────────────────────────────────────────"
