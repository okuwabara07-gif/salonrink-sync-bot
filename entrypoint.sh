#!/bin/bash
set -e

echo "🚀 Starting SALON BOARD Sync Bot"
echo "🔍 Checking Chromium availability..."

# Try to use system Chromium if available
if [ -f "/usr/bin/chromium" ]; then
  echo "✓ System Chromium found at /usr/bin/chromium"
  export CHROMIUM_PATH=/usr/bin/chromium
  export PLAYWRIGHT_LAUNCH_ARGS="--no-sandbox"
fi

# Check Playwright cache
if [ -d "$HOME/.cache/ms-playwright" ]; then
  echo "✓ Playwright cache found"
  ls -la "$HOME/.cache/ms-playwright/chromium_headless_shell-"* 2>/dev/null || echo "⚠ No chromium_headless_shell found in cache"
fi

echo "📦 Environment:"
echo "  NODE_ENV=${NODE_ENV}"
echo "  HOME=${HOME}"
echo "  CHROMIUM_PATH=${CHROMIUM_PATH:-not set}"

echo "▶ Running application..."
exec node dist/index.js
