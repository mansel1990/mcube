#!/usr/bin/env bash
# Deploy relay to DigitalOcean droplet. Requires SSH access to root@167.71.235.230
set -euo pipefail

HOST="${RELAY_HOST:-root@167.71.235.230}"
REMOTE_DIR="${RELAY_REMOTE_DIR:-/opt/mcube-kite-relay}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ Copying relay files to $HOST:$REMOTE_DIR"
scp "$SCRIPT_DIR/server.mjs" "$SCRIPT_DIR/gtt-payload.mjs" "$SCRIPT_DIR/package.json" "$HOST:$REMOTE_DIR/"

echo "→ Restarting mcube-kite-relay"
ssh "$HOST" "cd $REMOTE_DIR && npm install --omit=dev && sudo systemctl restart mcube-kite-relay && sleep 1 && curl -s http://127.0.0.1:3100/health"

echo "Done. Verify gtt support: curl http://167.71.235.230:3100/health should show {\"gtt\":true}"
