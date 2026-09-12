#!/bin/bash
set -Eeuo pipefail

_PWD_WIN="$(pwd -W 2>/dev/null || pwd)"
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-${_PWD_WIN}}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"


start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    PORT=${DEPLOY_RUN_PORT} node dist/server.js
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
