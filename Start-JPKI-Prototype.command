#!/bin/zsh
set -eu
unsetopt BG_NICE
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ ! -d services/mac-prototype/node_modules || ! -x services/mac-prototype/.venv/bin/python ]]; then
  echo '初回セットアップ: ./scripts/setup-mac-prototype.sh'
  read -r '?Enterで終了'; exit 1
fi
if curl -fsS --max-time 2 http://localhost:18080/healthz 2>/dev/null | node -e 'let s="";for await(const c of process.stdin)s+=c;process.exit(JSON.parse(s).mode==="local-mac"?0:1)' 2>/dev/null; then
  echo '起動済みです: http://localhost:18080/app/'
  open 'http://localhost:18080/app/' || true
  exit 0
fi
node services/mac-prototype/server.mjs &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' EXIT INT TERM
for attempt in {1..30}; do
  if curl -fsS --max-time 1 http://localhost:18080/healthz >/dev/null 2>&1; then break; fi
  if ! kill -0 "$app_pid" 2>/dev/null; then echo '起動できません。18080番ポートをご確認ください。'; exit 1; fi
  sleep 0.2
done
echo 'SafariまたはChromeで http://localhost:18080/app/ を開いてください。'
echo '終了するときはこのターミナルで Control+C を押してください。'
open 'http://localhost:18080/app/' || true
wait "$app_pid"
