#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p work/npm-cache work/pip-cache
npm --cache "$PWD/work/npm-cache" ci --prefix services/mac-prototype --ignore-scripts
python3 -m venv services/mac-prototype/.venv
services/mac-prototype/.venv/bin/pip --cache-dir "$PWD/work/pip-cache" install -r services/mac-prototype/native/requirements.txt
printf '\n準備完了。Start-JPKI-Prototype.command をダブルクリックしてください。\n'
