#!/usr/bin/env bash
# Point the Android emulator at a Herd/Valet `*.test` site on the Mac host.
#
# Play Store system images cannot edit /etc/hosts (no adb root). For those,
# the app rewrites `*.test` → 10.0.2.2 and sends Host: <site> (see
# lib/api/client.ts). This script still:
#   1) reverse-proxies host :80 for physical-device-style localhost tests
#   2) writes /etc/hosts when the AVD allows root (google_apis, not Play)
#
# Usage:
#   ./scripts/emulator-herd-dns.sh
#   ./scripts/emulator-herd-dns.sh pos-inventory-laravel.test

set -euo pipefail

SITE="${1:-pos-inventory-laravel.test}"
DEVICE="${ANDROID_SERIAL:-}"

adb_bin() {
  if [[ -n "$DEVICE" ]]; then
    adb -s "$DEVICE" "$@"
  else
    adb "$@"
  fi
}

if ! adb_bin get-state >/dev/null 2>&1; then
  echo "No emulator/device. Start one, then re-run." >&2
  exit 1
fi

echo "→ adb reverse tcp:80 tcp:80 (host Herd nginx)"
adb_bin reverse tcp:80 tcp:80 || true

if adb_bin root >/dev/null 2>&1; then
  adb_bin wait-for-device
  adb_bin remount >/dev/null 2>&1 || adb_bin shell mount -o rw,remount / >/dev/null 2>&1 || true
  if adb_bin shell "grep -q ' ${SITE}\$' /etc/hosts" 2>/dev/null; then
    echo "✓ /etc/hosts already has ${SITE}"
  else
    adb_bin shell "echo '10.0.2.2 ${SITE}' >> /etc/hosts"
    echo "✓ wrote 10.0.2.2 ${SITE} into emulator /etc/hosts"
  fi
  adb_bin shell cat /etc/hosts
else
  echo "⚠ Play/production image — cannot edit /etc/hosts."
  echo "  App uses 10.0.2.2 + Host: ${SITE} instead (EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_HOST)."
fi

echo "→ smoke: Host ${SITE} via 10.0.2.2/up"
adb_bin shell "curl -s --connect-timeout 3 -H 'Host: ${SITE}' http://10.0.2.2/up" || true
echo
