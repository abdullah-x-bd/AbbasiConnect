#!/usr/bin/env python3
"""UIAutomator smoke checks for the installable AbbasiConnect Android APK."""
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path("emulator-results")
OUT.mkdir(parents=True, exist_ok=True)

def adb(*args, timeout=45):
    return subprocess.run(["adb", *args], text=True, capture_output=True, timeout=timeout, check=True).stdout

def screenshot(label):
    with (OUT / (label + ".png")).open("wb") as f:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, check=True, timeout=40)

def nodes():
    adb("shell", "uiautomator", "dump", "/sdcard/abbasiconnect-ui.xml", timeout=60)
    subprocess.run(["adb", "pull", "/sdcard/abbasiconnect-ui.xml", str(OUT / "last-ui.xml")], stdout=subprocess.DEVNULL, check=True, timeout=40)
    return list(ET.parse(OUT / "last-ui.xml").getroot().iter("node"))

def wait(text, timeout=45):
    deadline=time.time()+timeout
    while time.time()<deadline:
        try:
            found=[n for n in nodes() if text.lower() in (n.get("text","")+" "+n.get("content-desc","")).lower()]
            if found:
                print("FOUND: "+text,flush=True)
                return found
        except Exception as e:
            print("UI retry: "+str(e)[:90],flush=True)
        time.sleep(2)
    raise AssertionError("Could not find: "+text)

def tap(text):
    found=wait(text)
    # Pick the lowest matching accessible element (useful for bottom CTA buttons).
    def center(n):
        coords=list(map(int,re.findall(r"\d+",n.get("bounds",""))))
        if len(coords)!=4: raise ValueError("Invalid UI bounds")
        return ((coords[0]+coords[2])//2,(coords[1]+coords[3])//2)
    positions=[center(n) for n in found]
    x,y=max(positions,key=lambda pair:pair[1])
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(2)

def type_into(label, value):
    inputs=[n for n in nodes() if n.get("content-desc","").lower()==label.lower() and "EditText" in n.get("class","")]
    if not inputs:
        raise AssertionError("Input missing: "+label)
    coords=list(map(int,re.findall(r"\d+",inputs[0].get("bounds",""))))
    adb("shell","input","tap",str((coords[0]+coords[2])//2),str((coords[1]+coords[3])//2))
    adb("shell","input","text",value)
    adb("shell","input","keyevent","4")
    time.sleep(1)

def scroll_down():
    adb("shell","input","swipe","540","1840","540","620","470")
    time.sleep(1.5)

print("Starting installed APK",flush=True)
adb("shell", "am", "force-stop", "org.abbasiconnect.app")
adb("shell", "monkey", "-p", "org.abbasiconnect.app", "-c", "android.intent.category.LAUNCHER", "1")
wait("AbbasiConnect",90)
wait("Sign in",50)
screenshot("01-welcome")
print("PASS welcome and launch",flush=True)
tap("Sign in")
wait("Welcome back")
wait("Username")
wait("Password")
screenshot("02-signin")
print("PASS sign-in screen",flush=True)
type_into("Username","qa_nonexistent_172")
type_into("Password","invalidQATest2026")
tap("Sign in")
wait("Incorrect username or password",70)
screenshot("03-api-rejected-invalid-login")
print("PASS native app connected to Render API and handled rejected credentials",flush=True)
tap("Create an account")
wait("Create your account")
wait("Full name")
scroll_down()
scroll_down()
wait("Request verification code",20)
screenshot("04-registration")
print("PASS registration screen",flush=True)
tap("Back")
wait("A place for people who matter")
screenshot("05-back-navigation")
print("PASS screen navigation",flush=True)
print("ALL UNAUTHENTICATED EMULATOR UI SMOKE TESTS PASSED",flush=True)
