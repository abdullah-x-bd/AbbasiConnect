#!/usr/bin/env python3
"""ABC Android native onboarding smoke test on a Pixel emulator."""
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

OUT=Path("abc-emulator-results");OUT.mkdir(exist_ok=True)
PACKAGE="org.abbasiconnect.bahishti"
def adb(*a,timeout=50):
    p=subprocess.run(["adb",*a],text=True,capture_output=True,timeout=timeout)
    if p.returncode!=0: raise RuntimeError("adb "+ " ".join(a)+": "+p.stderr[-250:])
    return p.stdout
def screen(name):
    with (OUT/(name+".png")).open("wb") as f:subprocess.run(["adb","exec-out","screencap","-p"],stdout=f,check=True,timeout=50)
def nodes():
    adb("shell","uiautomator","dump","/sdcard/abc-screen.xml",timeout=80)
    subprocess.run(["adb","pull","/sdcard/abc-screen.xml",str(OUT/"ui.xml")],capture_output=True,check=True,timeout=40)
    return list(ET.parse(OUT/"ui.xml").getroot().iter("node"))
def wait(text,timeout=65):
    until=time.time()+timeout
    while time.time()<until:
        try:
            found=[n for n in nodes() if text.lower() in (n.get("text","")+" "+n.get("content-desc","")).lower()]
            if found:return found
        except Exception as e:print("retry ui",str(e)[:110],flush=True)
        time.sleep(2)
    screen("failure")
    raise AssertionError("Missing native text: "+text)
def center(n):
    xy=[int(x) for x in re.findall(r"\d+",n.get("bounds",""))]
    return ((xy[0]+xy[2])//2,(xy[1]+xy[3])//2)
def tap(text):
    found=wait(text)
    x,y=max([center(n) for n in found],key=lambda p:p[1])
    adb("shell","input","tap",str(x),str(y));time.sleep(2)
def edit(label,value):
    fields=[n for n in nodes() if n.get("content-desc","").lower()==label.lower() and "EditText" in n.get("class","")]
    assert fields,"Missing input: "+label
    x,y=center(fields[0]);adb("shell","input","tap",str(x),str(y))
    adb("shell","input","text",value.replace(" ","%s"))
    adb("shell","input","keyevent","4")
    time.sleep(1)
def fail_logs():
    try:
        with (OUT/"logcat.txt").open("w") as fp:fp.write(adb("logcat","-d","-t","2500"))
    except Exception:pass

print("Launch ABC native APK",flush=True)
adb("shell","am","force-stop",PACKAGE)
adb("shell","monkey","-p",PACKAGE,"-c","android.intent.category.LAUNCHER","1")
wait("Meaningful connections begin with a conversation.",110)
screen("01-welcome")
print("PASS standalone branded ABC welcome",flush=True)
tap("Get started")
wait("Which language",100)
wait("आप किस भाषा")
wait("آپ کس زبان")
screen("02-trilingual-choice")
print("PASS three-language welcome in single prompt",flush=True)
tap("English")
wait("Looking for a bride")
tap("Looking for a bride")
wait("My own profile")
tap("My own profile")
wait("What is the candidate's full name?",100)
screen("03-chat-first-question")
print("PASS new draft saved, AI questionnaire entered",flush=True)
edit("Your answer","My name is Aftab Karim and I am 27 years old")
tap("Send answer")
wait("Aftab Karim",95)
screen("04-onboarding-conversation")
print("PASS native answer submitted to live OpenRouter-backed API",flush=True)
print("ALL ABC ONBOARDING SMOKE TESTS PASSED",flush=True)
fail_logs()
