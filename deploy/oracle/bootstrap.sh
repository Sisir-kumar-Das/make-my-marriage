#!/bin/bash
set -euo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077

[[ $(id -u) = 0 && $# = 2 ]]
node_binary=$1
public_key=$2
config=$(cd "$(dirname "$0")" && pwd)
node_version=$("$node_binary" --version)
[[ "$node_version" = v24.22.3 ]]
read -r key_type key_bytes _ < "$public_key"
[[ "$key_type" = ssh-ed25519 && "$key_bytes" =~ ^[A-Za-z0-9+/]+={0,2}$ ]]
ssh-keygen -lf "$public_key" >/dev/null

root=/opt/make-my-marriage
private=/etc/make-my-marriage
home=/var/lib/make-my-marriage/deploy
test "$(stat -c '%u:%a' "$private")" = 0:700
for file in "$private/atlas.env" "$private/providers.env"; do
  test "$(stat -c '%u:%a' "$file")" = 0:600
done
if ! id mmm-app >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin mmm-app
fi
if ! id mmm-deploy >/dev/null 2>&1; then
  install -d -m 0755 /var/lib/make-my-marriage
  useradd --system --user-group --create-home --home-dir "$home" --shell /bin/bash mmm-deploy
fi
test "$(getent passwd mmm-deploy | cut -d: -f6)" = "$home"
install -d -m 0755 "$root" "$root/node/bin" /usr/local/libexec
install -d -m 0755 -o mmm-deploy -g mmm-deploy "$root/releases"
install -d -m 0700 -o mmm-deploy -g mmm-deploy "$home/.ssh"
install -m 0755 "$node_binary" "$root/node/bin/node"
install -m 0755 "$config/receive-release.sh" /usr/local/libexec/mmm-receive-release
install -m 0755 "$config/activate-release.sh" /usr/local/libexec/mmm-activate-release
install -m 0644 "$config/mmm-api.service" "$config/mmm-web.service" /etc/systemd/system/
install -m 0600 "$config/Caddyfile" "$private/Caddyfile.release"
if [[ ! -e "$private/Caddyfile.before-release" ]]; then
  install -m 0600 /etc/caddy/Caddyfile "$private/Caddyfile.before-release"
fi
caddy validate --config "$private/Caddyfile.release" --adapter caddyfile

scratch=$(mktemp -d)
trap 'rm -f -- "$scratch/authorized_keys" "$scratch/sudoers"; rmdir -- "$scratch"' EXIT
printf 'restrict,command="/usr/local/libexec/mmm-receive-release" %s %s\n' "$key_type" "$key_bytes" > "$scratch/authorized_keys"
if [[ -e "$home/.ssh/authorized_keys" ]]; then
  cmp -s "$home/.ssh/authorized_keys" "$scratch/authorized_keys"
else
  install -m 0600 -o mmm-deploy -g mmm-deploy "$scratch/authorized_keys" "$home/.ssh/authorized_keys"
fi
printf 'mmm-deploy ALL=(root) NOPASSWD: /usr/local/libexec/mmm-activate-release\n' > "$scratch/sudoers"
visudo -cf "$scratch/sudoers"
install -m 0440 "$scratch/sudoers" /etc/sudoers.d/make-my-marriage-deploy
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/mmm-api.service /etc/systemd/system/mmm-web.service
printf 'Installed the release receiver and production units. Caddy cutover happens during activation.\n'
