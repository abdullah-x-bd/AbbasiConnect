#!/usr/bin/env python3
"""End-to-end Android emulator UI verification against two isolated QA accounts."""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

OUT=Path("emulator-results")
OUT.mkdir(parents=True,exist_ok=True)
USER=os.environ["QA_USERNAME"]
PASSWORD=os.environ["QA_PASSWORD"]

def adb(*a, timeout=50):
    return subprocess.run(["adb",*a],capture_output=True,text=True,check=True,timeout=timeout).stdout
def shot(name):
    with (OUT/(name+".png")).open("wb") as out:
        subprocess.run(["adb","exec-out","screencap","-p"],stdout=out,check=True,timeout=45)
def nodes():
    adb("shell","uiautomator","dump","/sdcard/qa-view.xml",timeout=65)
    subprocess.run(["adb","pull","/sdcard/qa-view.xml",str(OUT/"qa-last.xml")],check=True,stdout=subprocess.DEVNULL,timeout=45)
    return list(ET.parse(OUT/"qa-last.xml").getroot().iter("node"))
def matching(text):
    return [n for n in nodes() if text.lower() in (n.get("text","")+" "+n.get("content-desc","")).lower()]
def wait(text,seconds=65):
    until=time.time()+seconds
    while time.time()<until:
        try:
            a=matching(text)
            if a:
                print("FOUND",text,flush=True)
                return a
        except Exception as e:
            print("UI scan retry",str(e)[:50],flush=True)
        time.sleep(1.8)
    shot("failure-"+re.sub("[^a-z0-9]","-",text.lower())[:35])
    raise AssertionError("UI text not found: "+text)
def point(n):
    z=[int(v) for v in re.findall(r"\d+",n.get("bounds",""))]
    return (z[0]+z[2])//2,(z[1]+z[3])//2
def tap(text):
    a=wait(text)
    x,y=max(map(point,a),key=lambda x:x[1])
    adb("shell","input","tap",str(x),str(y))
    time.sleep(2)
def field(label,value):
    a=[n for n in nodes() if "EditText" in n.get("class","") and n.get("content-desc","").lower()==label.lower()]
    if not a: raise AssertionError("Text field not found: "+label)
    x,y=point(a[0])
    adb("shell","input","tap",str(x),str(y))
    adb("shell","input","text",value)
    adb("shell","input","keyevent","4")
    time.sleep(1)
def scroll_down():
    adb("shell","input","swipe","520","1900","520","650","450")
    time.sleep(1.2)

print("Opening Android app using pre-created isolated QA member",flush=True)
adb("shell","am","force-stop","org.abbasiconnect.app")
adb("shell","monkey","-p","org.abbasiconnect.app","-c","android.intent.category.LAUNCHER","1")
wait("A place for people who matter",90)
tap("Sign in")
wait("Welcome back")
field("Username",USER)
field("Password",PASSWORD)
tap("Sign in")
wait("Hello, QA",95)
shot("10-member-home")
print("PASS native authenticated sign-in and home bootstrap",flush=True)

tap("Family")
wait("Family tree")
wait("Connected family")
shot("11-member-family")
tap("Relatives")
wait("My family links")
shot("12-member-family-links")
tap("Privacy")
wait("Requests to view your tree")
print("PASS native family tree, relatives and privacy screens",flush=True)

tap("Rishte")
wait("Thoughtful connections between families")
tap("My listing")
wait("Your matrimonial listing")
shot("13-member-rishte")
tap("Interests")
wait("Interests")
tap("Discover")
wait("Search name, occupation or education")
print("PASS native Rishte discovery, listing and interest screens",flush=True)

tap("Community")
wait("Share something")
wait("What's on your mind?")
shot("14-member-community")
print("PASS native community feed and compose UI",flush=True)

tap("Messages")
wait("Private conversations with your people.")
shot("15-member-messages")
if matching("Unlock secure messages"):
    print("Messaging key not yet ready; unlocking with account password",flush=True)
    field("Account password",PASSWORD)
    tap("Unlock messages")
wait("Encrypted messaging unlocked on this device",95)
wait("Conversations")
print("PASS native RSA/AES backup decryption and key unlock",flush=True)
# A two-member QA direct-message thread was created by the live API E2E suite.
tap("QA B Test")
wait("Encrypted conversation",70)
wait("QA encrypted hello",70)
shot("16-native-decrypted-message")
print("PASS native encrypted-message rendering and decryption",flush=True)

tap("Account")
wait("Your account")
wait("Public profile")
shot("17-member-account")
print("PASS native account and profile screen",flush=True)

adb("shell","am","force-stop","org.abbasiconnect.app")
adb("shell","monkey","-p","org.abbasiconnect.app","-c","android.intent.category.LAUNCHER","1")
wait("Hello, QA",90)
shot("18-persisted-session")
print("PASS session restoration after Android process restart",flush=True)

print("ALL AUTHENTICATED ANDROID E2E UI TESTS PASSED",flush=True)
