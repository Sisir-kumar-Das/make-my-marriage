#!/bin/bash
set -euo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077

[[ $(id -u) = 0 && $# = 1 && "$1" =~ ^[0-9a-f]{40}$ ]]
root=/opt/make-my-marriage
current="$root/current"
release="$root/releases/$1"
domain=make-my-marriage-easy.duckdns.org
caddyfile=/etc/caddy/Caddyfile
template=/etc/make-my-marriage/Caddyfile.release
baseline=/etc/make-my-marriage/Caddyfile.before-release
test "$(realpath -e "$release")" = "$release"
test -d "$release"

exec 9> "$root/.activation.lock"
flock -w 60 9
previous=
if [[ -L "$current" ]]; then
  previous=$(readlink "$current")
  [[ "$previous" =~ ^/opt/make-my-marriage/releases/[0-9a-f]{40}$ && -d "$previous" ]]
else
  test ! -e "$current"
fi
if ! cmp -s "$caddyfile" "$template"; then
  cmp -s "$caddyfile" "$baseline"
  caddy validate --config "$template" --adapter caddyfile
fi

stage=$(mktemp -d "$root/.activation.XXXXXX")
install -m 0644 "$caddyfile" "$stage/Caddyfile.before"
changed_caddy=0
activated=0
point_to() {
  ln -sfn "$1" "$stage/current.next"
  mv -Tf -- "$stage/current.next" "$current"
}
finish() {
  local status=$?
  trap - EXIT
  set +e
  if (( status != 0 && activated == 1 )); then
    printf 'Release checks failed. Restoring the preceding configuration.\n' >&2
    if (( changed_caddy )); then
      install -m 0644 "$stage/Caddyfile.before" "$caddyfile" &&
        systemctl reload caddy || printf 'Caddy rollback needs attention.\n' >&2
    fi
    if [[ -n "$previous" ]]; then
      point_to "$previous" &&
        systemctl restart mmm-api.service mmm-web.service || printf 'App rollback needs attention.\n' >&2
    else
      rm -f -- "$current"
      systemctl disable --now mmm-web.service mmm-api.service >/dev/null 2>&1 || true
    fi
  fi
  rm -f -- "$stage/Caddyfile.before" "$stage/current.next" "$stage/home.html"
  rmdir -- "$stage"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT TERM HUP

activated=1
point_to "$release"
systemctl restart mmm-api.service mmm-web.service
for attempt in {1..28}; do
  if curl -fsS --max-time 2 http://127.0.0.1:4000/api/v1/health >/dev/null 2>&1 &&
     curl -fsS --max-time 2 http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1 &&
     curl -fsS --max-time 3 http://127.0.0.1:3000/ -o "$stage/home.html" 2>/dev/null &&
     grep -Fq 'Plan every moment.' "$stage/home.html"; then break; fi
  test "$attempt" -lt 28
  sleep 1
done
if ! cmp -s "$caddyfile" "$template"; then
  changed_caddy=1
  install -m 0644 "$template" "$caddyfile"
  systemctl reload caddy
fi
curl -fsS --max-time 12 --resolve "$domain:443:127.0.0.1" "https://$domain/api/v1/health" >/dev/null
curl -fsS --max-time 12 --resolve "$domain:443:127.0.0.1" "https://$domain/" -o "$stage/home.html"
grep -Fq 'Plan every moment.' "$stage/home.html"
systemctl enable mmm-api.service mmm-web.service >/dev/null
printf 'Activated %s. Private and public HTTPS checks passed.\n' "$1"
