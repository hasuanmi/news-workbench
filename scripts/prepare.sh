#!/bin/bash
set -Eeuo pipefail

_PWD_WIN="$(pwd -W 2>/dev/null || pwd)"
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-${_PWD_WIN}}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only
if command -v coze-dev > /dev/null 2>&1 && coze-dev check-bins --help > /dev/null 2>&1; then
  coze-dev check-bins --fix
fi
