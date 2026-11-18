#!/bin/bash
# Install Mansel Live cron on mcube-server. Run there as root:
#   bash engine/deploy.sh --install
set -euo pipefail

ROOT=/opt/mcube-src/mcube
TSX="$ROOT/node_modules/.bin/tsx"
LOG=/var/log/mcube-mlive.log

run_line() {
  local spec="$1"
  local job="$2"
  echo "$spec root bash -lc 'set -a; source /etc/mcube/mlive.env; set +a; cd $ROOT && $TSX engine/cli.ts $job' >> $LOG 2>&1"
}

if [[ "${1:-}" != "--install" ]]; then
  echo "On the server: bash engine/deploy.sh --install"
  echo "That pulls $ROOT, runs npm ci and npm run engine:build, and writes /etc/cron.d/mlive."
  exit 0
fi

cd "$ROOT"
if [[ "${MLIVE_DEPLOY_REFRESHED:-0}" != "1" ]]; then
  git pull --ff-only
  export MLIVE_DEPLOY_REFRESHED=1
  exec bash "$ROOT/engine/deploy.sh" --install
fi
npm ci
npm run engine:build

cat > /etc/cron.d/mlive << EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
CRON_TZ=Asia/Kolkata
$(run_line "20 18 * * 1-5" "import-ideas")
$(run_line "40 18 * * 1-5" "import-ideas")
$(run_line "45 19 * * 1-5" "eod-stops")
$(run_line "30 8 * * 1-5" "remind")
$(run_line "0 9 * * 1-5" "remind")
$(run_line "35,40,45,50,55 8 * * 1-5" "preflight")
$(run_line "0,5,10 9 * * 1-5" "preflight")
$(run_line "20 9 * * 1-5" "sells")
$(run_line "40 9 * * 1-5" "refresh")
$(run_line "45 9 * * 1-5" "buys")
$(run_line "15,20,25,30,35,40,45 9 * * 1-5" "approvals")
$(run_line "46-59 9 * * 1-5" "approvals")
$(run_line "* 10-14 * * 1-5" "approvals")
$(run_line "*/5 9-15 * * 1-5" "sync")
$(run_line "15 15 * * 1-5" "cancel")
$(run_line "45 15 * * 1-5" "eod")
$(run_line "10 16 * * 1-5" "longterm-proposal")
$(run_line "50 19 * * 1-5" "eod-final")
$(run_line "5 20 * * 1-5" "market-daily")
$(run_line "40 20 * * 1-5" "momentum-eod")
*/10 0-6,16,20-23 * * * root bash -lc 'set -a; source /etc/mcube/mlive.env; set +a; cd $ROOT && NODE_OPTIONS=--max-old-space-size=600 $TSX engine/cli.ts research-queue' >> $LOG 2>&1
EOF
chmod 644 /etc/cron.d/mlive
echo "Installed /etc/cron.d/mlive"
