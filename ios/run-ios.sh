#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f Sources/CocoaLocal/Connection.json ]]; then
  echo 'Run python3 ../scripts/iphone-setup.py --host YOUR_PC_WIFI_IP first.' >&2
  exit 1
fi
# Reuse the Windows Apple Mobile Device bridge when available.
if [[ -z "${USBMUXD_SOCKET_ADDRESS:-}" ]] && grep -qi microsoft /proc/sys/kernel/osrelease; then
  gateway="$(ip route | awk '/^default/ { print $3; exit }')"
  if timeout 1 bash -c "echo > /dev/tcp/$gateway/27015" 2>/dev/null; then
    export USBMUXD_SOCKET_ADDRESS="$gateway:27015"
  fi
fi
xtool dev run "$@"

