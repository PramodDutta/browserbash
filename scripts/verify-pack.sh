#!/usr/bin/env bash
# Verifies the npm tarball installs cleanly and the bin works.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build >/dev/null
TARBALL=$(npm pack --silent)
DIR=$(mktemp -d)

(
    cd "$DIR"
    npm init -y >/dev/null
    npm install --silent "$OLDPWD/$TARBALL"
    ./node_modules/.bin/browserbash --help >/dev/null
    ./node_modules/.bin/browserbash providers | grep -q 'local (default)'
)

rm -rf "$DIR" "$TARBALL"
echo "PACK OK"
