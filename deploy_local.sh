#!/bin/bash
set -e

MODE=${1:-dev}

echo "Building client..."
cd src/client
npm run build
cd ../..

echo "Starting server (npm run $MODE)..."
npm run "$MODE"
