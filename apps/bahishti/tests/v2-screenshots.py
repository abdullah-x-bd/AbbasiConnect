#!/usr/bin/env python3
"""Native screenshot audit of every ABC v2 screen on Pixel Android emulator.

Compiles a separate preview-only APK with seeded example data. This file is not
included in the production user's APK and makes no real API/database changes.
"""
import json, re, subprocess, time
import xml.etree.ElementTree as ET
from pathlib import Path

OUT=Path("abc-v2-screenshots")
OUT.mkdir(exist_ok=True)
SCREENS=[
    ("01-welcome","Welcome / Home"),
    ("02-phone","Mobile number"),
    ("03-existing","Already registered phone"),
    ("04-verification","Temporary verification step"),
    ("05-pin","Four-digit PIN setup"),
    ("06-login","Returning member login"),
    ("07-language","Hinglish or English language choice"),
    ("08-seeking","Bride or groom choice"),
    ("09-profile-for","Registering for self or family"),
    ("10-relationship","Family relationship"),
    ("11-marital","Marital status choice"),
    ("12-mode","Chat or Voice Call choice"),
    ("13-chat","Text chat without speech playback"),
    ("14-voice","Voice Call controls and captions"),
    ("15-voice-ended","Stopped call and resume options"),
    ("16-photo","Optional photo upload or skip"),
    ("17-thank-you","Interview completion"),
    ("18-review","Review and correct information"),
    ("19-explore","Explore Rishte"),
    ("20-interests","Interests inbox"),
    ("21-profile","My profile with account deletion"),
    ("22-delete-account","PIN-confirmed account deletion"),
    ("23-paused","Saved conversation and resume"),
    ("24-biodata","JPEG biodata preview"),
    ("25-more-details","Optional enrichment list"),
    ("26-edit-detail","Automatic-cleanup editor")
]
def adb(*args,timeout=45):
    p=subprocess.run(["adb",*args],capture_output=True,text=True,timeout=timeout)
    if p.returncode:raise RuntimeError("adb failed: "+" ".join(args)+" "+p.stderr[-300:])
    return p.stdout

def dump():
    # Android's Pixel Launcher can briefly show a system ANR dialog after boot,
    # even while ABC itself is healthy. Recover instead of testing the dialog.
    for attempt in range(3):
        adb("shell","uiautomator","dump","/sdcard/abc.xml",timeout=75)
        adb("pull","/sdcard/abc.xml","abc-v2-screenshots/ui.xml")
        items=list(ET.parse(OUT/"ui.xml").getroot().iter("node"))
        if not any("isn't responding" in n.attrib.get("text","") for n in items):
            return items
        wait=[n for n in items if n.attrib.get("text","").strip()=="Wait"]
        if wait:
            x,y=bounds(wait[-1])
            adb("shell","input","tap",str(x),str(y))
        time.sleep(4)
        adb("shell","am","start","-n","org.abbasiconnect.bahishti/.MainActivity")
    return items
def bounds(node):
    v=[int(x) for x in re.findall(r"\d+",node.attrib.get("bounds",""))]
    return (v[0]+v[2])//2,(v[1]+v[3])//2
EXPECTED=[
 "Naya account banayein","Your mobile number","This number is already registered",
 "Continue with this number","Choose a 4-digit PIN","Welcome back",
 "How should we talk","Looking for a","Whose profile is this","How are you related",
 "Marital status","How would you like to answer","Conversation","ABC Voice Call",
 "Your answers are saved","Would you like to add a photo",
 "We have all the details","Your answers","Explore / Rishte",
 "Interests","Delete my account","Delete your ABC account","Your answers are saved",
 "Your Bio Data","More details","More about education"
]
def verify_screen(i):
    expected=EXPECTED[i]
    if i==20:
        # The deletion control sits below the visible portion of My Profile.
        # Scroll within the real screen before checking its accessibility text.
        time.sleep(1.5)
        adb("shell","input","swipe","520","1750","520","650","550")
        time.sleep(1.0)
        adb("shell","input","swipe","520","1750","520","650","550")
        time.sleep(1.2)
    for attempt in range(15):
        contents=" ".join(n.attrib.get("text","")+" "+n.attrib.get("content-desc","") for n in dump())
        if expected.lower() in contents.lower():return
        time.sleep(1.3)
    raise AssertionError("Screenshot is not on expected page "+str(i+1)+": "+expected+
      " Actual: "+contents[:450])

def next_screen():
    nodes=dump()
    hits=[n for n in nodes if "Next preview screen" in n.attrib.get("content-desc","")]
    if not hits:
        print("No accessible hidden QA control; using fixed top-right tap",flush=True)
        adb("shell","input","tap","1000","110")
    else:
        x,y=bounds(hits[-1])
        adb("shell","input","tap",str(x),str(y))
    time.sleep(1.0)
adb("shell","am","force-stop","org.abbasiconnect.bahishti")
adb("shell","am","start","-n","org.abbasiconnect.bahishti/.MainActivity")
time.sleep(15)
metadata=[]
for i,(name,description) in enumerate(SCREENS):
    if i:next_screen()
    verify_screen(i)
    file=OUT/(name+".png")
    with file.open("wb") as f:
        subprocess.run(["adb","exec-out","screencap","-p"],stdout=f,timeout=45,check=True)
    assert file.stat().st_size>20000,(name,file.stat().st_size)
    metadata.append({"screen":description,"file":file.name,"bytes":file.stat().st_size})
    print("CAPTURED",name,description,file.stat().st_size,flush=True)
(OUT/"manifest.json").write_text(json.dumps(metadata,indent=2))
print("ABC V2 SCREENSHOT AUDIT COMPLETE:",len(metadata),"screens",flush=True)
