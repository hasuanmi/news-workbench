#!/bin/bash
set -Eeuo pipefail

_PWD_WIN="$(pwd -W 2>/dev/null || pwd)"
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-${_PWD_WIN}}"

cd "${COZE_WORKSPACE_PATH}"

echo "🔍 Running validate..."
pnpm validate
echo "✅ Validate passed!"
