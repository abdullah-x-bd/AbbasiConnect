import { Buffer } from "buffer";
import { api } from "./api";

// The native WebCrypto polyfill is installed in index.js before this module.
const keys = new Map<string, CryptoKey>();
const rsa = { name: "RSA-OAEP", hash: "SHA-256" } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const subtle = () => {
  const instance = globalThis.crypto?.subtle;
  if (!instance) throw new Error("Native WebCrypto is not available. Use an Expo development build, not Expo Go.");
  return instance;
};
function buffer(value: Uint8Array) { return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer; }
function encode(value: ArrayBuffer) { return Buffer.from(new Uint8Array(value)).toString("base64"); }
function decode(value: string) { return Uint8Array.from(Buffer.from(value, "base64")).buffer as ArrayBuffer; }
function random(length: number) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return buffer(bytes);
}
async function wrappingKey(password: string, salt: ArrayBuffer) {
  const material = await subtle().importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
type Bundle = { configured?: boolean; publicKey?: string | null; encryptedPrivateKey?: string | null; salt?: string | null; iv?: string | null; version?: number };
export function isUnlocked(userId: string) { return keys.has(userId); }
export function lockMessaging() { keys.clear(); }

export async function prepareMessaging(userId: string, password: string) {
  if (keys.has(userId)) return;
  const bundle = await api<Bundle>("/crypto/me");
  if (bundle.publicKey && bundle.encryptedPrivateKey && bundle.salt && bundle.iv) {
    const aes = await wrappingKey(password, decode(bundle.salt));
    const privateBytes = await subtle().decrypt({ name: "AES-GCM", iv: decode(bundle.iv) }, aes, decode(bundle.encryptedPrivateKey));
    const privateKey = await subtle().importKey("jwk", JSON.parse(decoder.decode(privateBytes)), rsa, false, ["decrypt"]);
    keys.set(userId, privateKey);
    return;
  }
  if (bundle.configured || bundle.publicKey) throw new Error("Existing encryption keys are incomplete. They were not replaced.");
  const pair = await subtle().generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]) as CryptoKeyPair;
  const publicKey = JSON.stringify(await subtle().exportKey("jwk", pair.publicKey));
  const privateJwk = JSON.stringify(await subtle().exportKey("jwk", pair.privateKey));
  const salt = random(16), iv = random(12);
  const aes = await wrappingKey(password, salt);
  const encryptedPrivateKey = encode(await subtle().encrypt({ name: "AES-GCM", iv }, aes, encoder.encode(privateJwk)));
  await api("/crypto/me", { method: "PUT", body: { publicKey, encryptedPrivateKey, salt: encode(salt), iv: encode(iv), version: 1 } });
  keys.set(userId, await subtle().importKey("jwk", JSON.parse(privateJwk), rsa, false, ["decrypt"]));
}
async function publicKey(jwk: string) { return subtle().importKey("jwk", JSON.parse(jwk), rsa, false, ["encrypt"]); }
export async function getMyPublicKey() {
  const bundle = await api<Bundle>("/crypto/me");
  if (!bundle.publicKey) throw new Error("Set up encrypted messaging first");
  return bundle.publicKey;
}
export async function encryptMessage(text: string, senderPublicKey: string, recipientPublicKey: string) {
  const aes = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]) as CryptoKey;
  const iv = random(12);
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv }, aes, encoder.encode(text));
  const rawKey = await subtle().exportKey("raw", aes);
  const [senderKey, recipientKey] = await Promise.all([
    subtle().encrypt({ name: "RSA-OAEP" }, await publicKey(senderPublicKey), rawKey),
    subtle().encrypt({ name: "RSA-OAEP" }, await publicKey(recipientPublicKey), rawKey)
  ]);
  return { ciphertext: encode(ciphertext), iv: encode(iv), senderKey: encode(senderKey), recipientKey: encode(recipientKey), encryptionVersion: 1 };
}
export async function decryptMessage(message: { ciphertext: string; iv: string; wrappedKey: string }, userId: string) {
  const key = keys.get(userId);
  if (!key) throw new Error("Unlock encrypted messages using your password");
  const aesBytes = await subtle().decrypt({ name: "RSA-OAEP" }, key, decode(message.wrappedKey));
  const aes = await subtle().importKey("raw", aesBytes, "AES-GCM", false, ["decrypt"]);
  const plaintext = await subtle().decrypt({ name: "AES-GCM", iv: decode(message.iv) }, aes, decode(message.ciphertext));
  return decoder.decode(plaintext);
}
