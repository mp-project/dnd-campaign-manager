#!/bin/bash
DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  CFG="$DIR/.claude.json"
else
  CFG="$HOME/.claude.json"
fi
MAIL=$(jq -r '.oauthAccount.emailAddress // "unbekannt"' "$CFG" 2>/dev/null)
echo "👤 $MAIL  ($(basename "$DIR"))"