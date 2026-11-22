#!/bin/bash
set -euo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 022

command=${SSH_ORIGINAL_COMMAND:-}
if [[ ! "$command" =~ ^publish\ ([0-9a-f]{40})$ ]]; then
  printf 'Expected a publish command and a commit SHA.\n' >&2
  exit 2
fi
sha=${BASH_REMATCH[1]}
releases=/opt/make-my-marriage/releases
stage=$(mktemp -d "$releases/.incoming.XXXXXX")
trap 'if [[ -d "$stage" ]]; then rm -rf -- "$stage"; fi' EXIT
tar -xzf - --no-same-owner --no-same-permissions -C "$stage"
test -f "$stage/apps/api/src/server.js"
test -s "$stage/apps/web/.next/BUILD_ID"
test -f "$stage/lib/visible-text.js"
test -f "$stage/node_modules/next/dist/bin/next"
test ! -e "$stage/apps/web/.next/cache" && test ! -L "$stage/apps/web/.next/cache"
ln -s /var/cache/make-my-marriage-web "$stage/apps/web/.next/cache"
chmod 0755 "$stage"
mv -T -n -- "$stage" "$releases/$sha"
sudo -n /usr/local/libexec/mmm-activate-release "$sha"
