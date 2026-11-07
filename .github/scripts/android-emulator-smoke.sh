#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-results
adb wait-for-device
adb install -r emulator-apk/app-release.apk
adb shell pm list packages | grep -F org.abbasiconnect.app
adb logcat -c
python3 apps/mobile/tests/emulator-ui.py
adb logcat -d -v threadtime > emulator-results/logcat.txt
if grep -E 'FATAL EXCEPTION|Unable to load script|SoLoaderDSONotFoundError' emulator-results/logcat.txt > emulator-results/fatal-patterns.txt; then
  echo "Fatal Android crash signature found:"
  cat emulator-results/fatal-patterns.txt
  exit 1
fi
echo "PASS: Android native runtime, login API response and navigation smoke tests"
