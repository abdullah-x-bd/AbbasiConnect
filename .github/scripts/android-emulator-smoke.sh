#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-results

collect_diagnostics() {
  status=$?
  trap - EXIT
  adb logcat -d -v threadtime > emulator-results/logcat.txt 2>/dev/null || true
  adb shell dumpsys activity activities > emulator-results/activities.txt 2>/dev/null || true
  adb shell dumpsys window > emulator-results/window.txt 2>/dev/null || true
  adb exec-out screencap -p > emulator-results/final-screen.png 2>/dev/null || true
  if grep -E 'FATAL EXCEPTION|Unable to load script|SoLoaderDSONotFoundError' emulator-results/logcat.txt > emulator-results/fatal-patterns.txt; then
    echo "Fatal Android error signatures detected"
    cat emulator-results/fatal-patterns.txt
    status=1
  fi
  if [ "$status" -ne 0 ]; then
    echo "Test failed. Relevant Android log messages:"
    grep -E -i 'org\\.abbasiconnect|AndroidRuntime|ReactNativeJS|FATAL EXCEPTION|Unable to load script|SoLoader' emulator-results/logcat.txt | tail -100 || true
  fi
  exit "$status"
}
trap collect_diagnostics EXIT
adb wait-for-device
adb shell settings put system screen_off_timeout 1800000 || true
adb install -r emulator-apk/app-release.apk
adb shell pm list packages | grep -F org.abbasiconnect.app
adb logcat -c
python3 apps/mobile/tests/emulator-ui.py
echo "PASS: Android native runtime, login API response and navigation smoke tests"
