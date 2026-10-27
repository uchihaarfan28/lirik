#!/bin/bash
set -e
export USBMUXD_SOCKET_ADDRESS="$(ip route list default | awk '{print $3}'):27015"
export PATH=/usr/local/bin:/usr/bin:$PATH
echo "USBMUXD=$USBMUXD_SOCKET_ADDRESS"
which xtool || true
xtool --version || true
echo "--- devices ---"
xtool devices
echo "exit=$?"
