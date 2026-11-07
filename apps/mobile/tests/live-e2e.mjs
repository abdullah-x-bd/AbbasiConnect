import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { webcrypto, randomBytes } from "node:crypto";

const API = "https://abbasiconnect-api.onrender.com";
const qs = async (path, options = {}) => {
  const response = await fetch(API + path, {
    method: options.method || "GET",
    headers: { ...(options.body === undefined ? {} : {"content-type": "application/json"}), ...(options.token ? {authorization: "Bearer " + options.token} : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(50000)
  });
  const data = await response.json().catch(() => ({}));
  if (options.expect) {
    assert.equal(response.status, options.expect, path + " returned " + response.status);
    return data;
  }
  assert.ok(response.ok, path + " HTTP " + response.status + ": " + JSON.stringify(data).slice(0,300));
  return data;
};
const result = [];
const pass = name => { result.push(name); console.log("PASS " + name); };
const runId = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/\D/g,"").slice(-11);
const pw = randomBytes(20).toString("hex");
let a,b,postIds = [], commentIds = [];
function profile(u, visible = true) {
  return {displayName:u.user.displayName,city:"Delhi",state:"Delhi",country:"India",gender:"Other",
    education:"QA verification",occupation:"QA verification",about:"Automated QA account",languages:"English",
    interests:"Software testing",isDirectoryVisible:visible};
}
async function create(label) {
  const name = "qa_" + label + "_" + runId;
  const contact = "abbasi-qa-" + label + "-" + runId + "@example.invalid";
  const otp = await qs("/auth/request-otp-dev",{method:"POST",body:{contact}});
  assert.match(otp.developmentCode,/^\d{6}$/);
  return await qs("/auth/register",{method:"POST",body:{
    challengeId:otp.challengeId,otp:otp.developmentCode,contact,
    displayName:"QA "+label.toUpperCase()+" Test",username:name,password:pw,country:"India"
  }});
}
async function cryptoBundle(u) {
  const subtle = webcrypto.subtle;
  const pair = await subtle.generateKey({name:"RSA-OAEP",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["encrypt","decrypt"]);
  const publicJwk = JSON.stringify(await subtle.exportKey("jwk",pair.publicKey));
  const privateJwk = JSON.stringify(await subtle.exportKey("jwk",pair.privateKey));
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const mk = await subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
  const wk = await subtle.deriveKey({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},mk,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  const cipher = await subtle.encrypt({name:"AES-GCM",iv},wk,new TextEncoder().encode(privateJwk));
  const base64 = v=>Buffer.from(v).toString("base64");
  await qs("/crypto/me",{method:"PUT",token:u.token,body:{publicKey:publicJwk,encryptedPrivateKey:base64(cipher),salt:base64(salt),iv:base64(iv),version:1}});
  return {pair, publicJwk};
}
async function main(){
  assert.equal((await qs("/health")).ok,true); pass("Live API health");
  await qs("/auth/me",{expect:401}); pass("Protected endpoints require authentication");
  a = await create("a");
  b = await create("b");
  assert.ok(a.user.id && b.user.id && a.token && b.token);pass("Two member registrations with development OTP");
  assert.equal((await qs("/auth/sign-in",{method:"POST",body:{username:a.user.username,password:pw}})).user.id,a.user.id);
  assert.equal((await qs("/auth/session",{token:a.token})).user.id,a.user.id);
  await qs("/auth/me",{method:"PATCH",token:a.token,body:profile(a,false)});
  await qs("/auth/me",{method:"PATCH",token:b.token,body:profile(b,true)});
  assert.equal((await qs("/auth/me",{token:a.token})).isDirectoryVisible,false);pass("Sign-in, session and member profile editing");
  const directory=await qs("/directory?q="+encodeURIComponent(b.user.username),{token:a.token});
  assert.ok(directory.members.some(u=>u.id===b.user.id));pass("Visible member directory search");
  await qs("/family/tree/"+b.user.id,{token:a.token,expect:403});
  const request=await qs("/family/access/"+b.user.id,{token:a.token,method:"POST"});
  await qs("/family/access/"+request.access.id,{token:b.token,method:"PATCH",body:{action:"APPROVE"}});
  assert.equal((await qs("/family/tree/"+b.user.id,{token:a.token})).rootId,b.user.id);
  await qs("/family/access/"+request.access.id,{token:a.token,method:"PATCH",body:{action:"REVOKE"}});
  await qs("/family/tree/"+b.user.id,{token:a.token,expect:403});pass("Private tree access approval, revocation and enforcement");
  const created=await qs("/family/members",{token:a.token,method:"POST",body:{relativeName:"QA B Test",relation:"SIBLING",relationLabel:"Sibling"}});
  await qs("/family/claim",{token:b.token,method:"POST",body:{code:created.link.inviteCode}});
  const family=await qs("/family/me",{token:a.token});
  assert.ok(family.links.some(l=>l.id===created.link.id && l.status==="VERIFIED"));
  assert.ok((await qs("/family/tree/"+a.user.id,{token:a.token})).edges.some(x=>x.id===created.link.id));pass("Invite code, claimed family link and graph edges");
  const listing={isActive:true,headline:"QA test listing",bio:"Temporary QA entry",familyNote:"Test family",lookingFor:"QA only"};
  await qs("/rishte/me",{token:b.token,method:"PUT",body:listing});
  assert.ok((await qs("/rishte",{token:a.token})).profiles.some(x=>x.id===b.user.id));
  const interest=await qs("/rishte/"+b.user.id+"/interest",{token:a.token,method:"POST",body:{message:"Automated QA"}}); 
  assert.equal((await qs("/rishte/interests",{token:b.token})).received.some(x=>x.id===interest.interest.id),true);
  await qs("/rishte/interests/"+interest.interest.id,{token:b.token,method:"PATCH",body:{action:"ACCEPT"}});
  assert.ok((await qs("/rishte/interests",{token:a.token})).sent.some(x=>x.status==="ACCEPTED")); pass("Rishte publish, discovery, interest and acceptance");
  const post=await qs("/community/posts",{token:a.token,method:"POST",body:{body:"Automated QA post "+runId}});
  postIds.push(post.post.id);
  assert.ok((await qs("/community/feed",{token:b.token})).posts.some(x=>x.id===post.post.id));
  assert.equal((await qs("/community/posts/"+post.post.id+"/like",{token:b.token,method:"POST",body:{}})).liked,true);
  const comment=await qs("/community/posts/"+post.post.id+"/comments",{token:b.token,method:"POST",body:{body:"Automated QA comment"}});
  commentIds.push(comment.comment.id);
  assert.ok((await qs("/community/feed",{token:a.token})).posts.find(x=>x.id===post.post.id).comments.some(x=>x.id===comment.comment.id));
  await qs("/community/comments/"+comment.comment.id,{token:b.token,method:"DELETE"});
  commentIds.pop();
  pass("Community posting, feed, likes, comments and comment deletion");
  const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hRcAAAAASUVORK5CYII=";
  await qs("/media/profile",{token:a.token,method:"PUT",body:{dataUrl:png}});
  assert.equal((await qs("/media/profile/"+a.user.id,{token:b.token})).dataUrl,png);
  await qs("/media/profile",{token:a.token,method:"DELETE"});
  await qs("/media/profile/"+a.user.id,{token:a.token,expect:404});
  const photo=await qs("/media/posts",{token:a.token,method:"POST",body:{body:"QA photo",dataUrl:png}});
  postIds.push(photo.post.id);
  assert.equal((await qs("/media/posts/"+photo.post.id,{token:b.token})).dataUrl,png);
  pass("Profile image, image post, image retrieval and profile image removal");
  const [ka,kb]=await Promise.all([cryptoBundle(a),cryptoBundle(b)]);
  assert.equal((await qs("/crypto/me",{token:a.token})).configured,true);
  const thread=await qs("/messages-secure/threads/"+b.user.id,{token:a.token,method:"POST"});
  assert.ok(thread.recipientEncryptionReady);
  const aesKey=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
  const raw=await webcrypto.subtle.exportKey("raw",aesKey);
  const iv=webcrypto.getRandomValues(new Uint8Array(12));
  const plain="QA encrypted hello "+runId;
  const cipher=await webcrypto.subtle.encrypt({name:"AES-GCM",iv},aesKey,new TextEncoder().encode(plain));
  const sealed=async jwk=>Buffer.from(await webcrypto.subtle.encrypt({name:"RSA-OAEP"},await webcrypto.subtle.importKey("jwk",JSON.parse(jwk),{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"]),raw)).toString("base64");
  const payload={ciphertext:Buffer.from(cipher).toString("base64"),iv:Buffer.from(iv).toString("base64"),senderKey:await sealed(ka.publicJwk),recipientKey:await sealed(kb.publicJwk),encryptionVersion:1};
  await qs("/messages-secure/threads/"+thread.thread.id+"/messages",{token:a.token,method:"POST",body:payload});
  const received=await qs("/messages-secure/threads/"+thread.thread.id,{token:b.token});
  const message=received.messages.find(x=>x.encrypted && x.senderId===a.user.id);
  assert.ok(message && message.wrappedKey);
  const decrypted=await webcrypto.subtle.decrypt({name:"RSA-OAEP"},kb.pair.privateKey,Buffer.from(message.wrappedKey,"base64"));
  const msgKey=await webcrypto.subtle.importKey("raw",decrypted,"AES-GCM",false,["decrypt"]);
  const original=await webcrypto.subtle.decrypt({name:"AES-GCM",iv:Buffer.from(message.iv,"base64")},msgKey,Buffer.from(message.ciphertext,"base64"));
  assert.equal(new TextDecoder().decode(original),plain);
  assert.ok((await qs("/messages-secure/threads",{token:b.token})).threads.some(x=>x.id===thread.thread.id));
  pass("RSA and AES encrypted messaging, recipient decryption and thread history");
  const bootstrap=await qs("/performance/bootstrap",{token:a.token});
  assert.equal(bootstrap.userId,a.user.id);
  assert.ok(bootstrap.communityFeed && bootstrap.family && bootstrap.rishteProfiles);
  pass("Authenticated dashboard bootstrap");
  await qs("/admin/overview",{token:a.token,expect:403});
  pass("Admin API rejects ordinary member tokens");
  writeFileSync("/tmp/abbasiconnect-qa-session.json",JSON.stringify({a:{username:a.user.username,password:pw,id:a.user.id},b:{username:b.user.username,password:pw,id:b.user.id}}),{mode:0o600});
  console.log("PASS QA test session prepared for native emulator");
}
async function cleanup(){
  for(const cid of commentIds) await qs("/community/comments/"+cid,{token:b.token,method:"DELETE"}).catch(()=>{});
  for(const pid of postIds) await qs("/community/posts/"+pid,{token:a.token,method:"DELETE"}).catch(()=>{});
  if(b) await qs("/rishte/me",{token:b.token,method:"DELETE"}).catch(()=>{});
  if(a) await qs("/auth/me",{token:a.token,method:"PATCH",body:profile(a,false)}).catch(()=>{});
  if(b) await qs("/auth/me",{token:b.token,method:"PATCH",body:profile(b,false)}).catch(()=>{});
}
try {
  await main();
} finally {
  await cleanup();
}
console.log("END TO END API TESTS COMPLETE: "+result.length+" groups passed");
