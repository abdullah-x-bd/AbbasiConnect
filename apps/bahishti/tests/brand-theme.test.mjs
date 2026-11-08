import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const iconPath=new URL("../assets/abc-emblem.png",import.meta.url);
const config=JSON.parse(readFileSync(new URL("../app.json",import.meta.url),"utf8")).expo;
const ui=readFileSync(new URL("../src/minimal-ui.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/AppV2.tsx",import.meta.url),"utf8");
const extras=readFileSync(new URL("../src/ExtraScreens.tsx",import.meta.url),"utf8");

test("official ABC emblem included in the Android asset bundle without alteration",()=>{
  const bytes=readFileSync(iconPath);
  assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16),256);
  assert.equal(bytes.readUInt32BE(20),256);
  const sha=createHash("sha1").update("blob "+bytes.length).update(Buffer.from([0])).update(bytes).digest("hex");
  assert.equal(sha,"67db78cf355164ee4b4b8565b076250ffaeafc2f");
});
test("same emblem used as launcher icon, adaptive icon and splash",()=>{
  assert.equal(config.icon,"./assets/abc-emblem.png");
  assert.equal(config.android.adaptiveIcon.foregroundImage,config.icon);
  assert.equal(config.splash.image,config.icon);
  assert.equal(config.android.adaptiveIcon.backgroundColor,"#FAECD5");
  assert.equal(config.splash.backgroundColor,"#FAECD5");
  assert.equal(config.android.softwareKeyboardLayoutMode,"resize");
});
test("shared ivory and dark-green theme is applied across existing screens",()=>{
  assert.match(ui,/paper:"#FAECD5"/);
  assert.match(ui,/accent:"#0B5528"/);
  assert.match(ui,/export function BrandLogo/);
  assert.match(app,/BrandLogo size=\{252\}/);
  assert.match(app,/BrandLogo size=\{48\}/);
  assert.match(app,/BrandLogo size=\{64\}/);
  assert.match(extras,/BrandLogo size=\{48\}/);
});

test("optional details have automatic text cleanup and direct Save without a manual Gemini button",()=>{
  assert.doesNotMatch(extras,/Clean again with Gemini|Clean and review|onPrepare/);
  assert.match(extras,/Voice is cleaned automatically/);
  assert.match(extras,/Save this detail/);
  assert.match(app,/extraPreviewToken/);
  assert.doesNotMatch(app,/prepareExtra\(/);
});
