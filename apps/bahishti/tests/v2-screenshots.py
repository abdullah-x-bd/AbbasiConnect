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
    ("03-verification","Temporary verification step"),
    ("04-pin","Four-digit PIN setup"),
    ("05-login","Returning member login"),
    ("06-seeking","Bride or groom choice"),
    ("07-profile-for","Registering for self or family"),
    ("08-relationship","Family relationship"),
    ("09-chat","Simple AI conversation"),
    ("10-photo","Optional chat photo confirmation"),
    ("11-recording","Tap-to-record voice overlay"),
    ("12-thank-you","Interview completion"),
    ("13-review","Review and correct information"),
    ("14-explore","Explore Rishte"),
    ("15-interests","Interests inbox"),
    ("16-profile","My profile"),
    ("17-paused","Saved conversation and resume"),
]
def adb(*args,timeout=45):
    p=subprocess.run(["adb",*args],capture_output=True,text=True,timeout=timeout)
    if p.returncode:raise RuntimeError("adb failed: "+" ".join(args)+" "+p.stderr[-300:])
    return p.stdout

def dump():
    adb("shell","uiautomator","dump","/sdcard/abc.xml",timeout=75)
    adb("pull","/sdcard/abc.xml","abc-v2-screenshots/ui.xml")
    return list(ET.parse(OUT/"ui.xml").getroot().iter("node"))
def bounds(node):
    v=[int(x) for x in re.findall(r"\d+",node.attrib.get("bounds",""))]
    return (v[0]+v[2])//2,(v[1]+v[3])//2
EXPECTED=[
 "Naya account banayein","Your mobile number","Continue with this number",
 "Choose a 4-digit PIN","Welcome back","Looking for a","Whose profile is this",
 "How are you related","Conversation","Photo saved","Listening",
 "We have all the details","Your answers","Explore / Rishte",
 "Interests","My profile","Your answers are saved"
]
def verify_screen(i):
    expected=EXPECTED[i]
    for attempt in range(7):
        contents=" ".join(n.attrib.get("text","")+" "+n.attrib.get("content-desc","") for n in dump())
        if expected.lower() in contents.lower():return
        time.sleep(1.3)
    raise AssertionError("Screenshot is not on expected page "+str(i+1)+": "+expected)

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
adb("shell","monkey","-p","org.abbasiconnect.bahishti","-c","android.intent.category.LAUNCHER","1")
time.sleep(10)
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
