#!/bin/bash
set -euo pipefail
export USBMUXD_SOCKET_ADDRESS="$(ip route list default | awk '{print $3}'):27015"
export PATH=/usr/local/bin:/usr/bin:$PATH
cd "/mnt/d/CURSOR PROJECT/lirik-island/ios"
echo "USBMUXD=$USBMUXD_SOCKET_ADDRESS"
echo "cwd=$(pwd)"
if [[ ! -f LirikIsland/AppConfig.swift ]]; then
  echo "ERROR: AppConfig.swift missing"
  exit 1
fi
echo "--- xtool devices ---"
xtool devices
echo "--- xtool dev ---"
xtool dev
echo "xtool_dev_exit=$?"
