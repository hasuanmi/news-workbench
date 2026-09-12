#!/bin/bash
set -Eeuo pipefail

_PWD_WIN="$(pwd -W 2>/dev/null || pwd)"
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-${_PWD_WIN}}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building the Next.js project..."
pnpm next build

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"
