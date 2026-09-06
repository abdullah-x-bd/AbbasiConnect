export type ApiFn = (path: string, options?: RequestInit) => Promise<any>;

type KeyBundle = {
  configured: boolean;
  publicKey?: string | null;
  encryptedPrivateKey?: string | null;
  salt?: string | null;
  iv?: string | null;
  version?: number;
};

const PRIVATE_PREFIX = "abbasiconnect_e2ee_private_";
const PUBLIC_PREFIX = "abbasiconnect_e2ee_public_";

function bytesToBase64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function randomBuffer(length: number): ArrayBuffer {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes.buffer;
}

async function deriveWrappingKey(password: string, salt: ArrayBuffer) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function createIdentity(password: string) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const salt = randomBuffer(16);
  const iv = randomBuffer(12);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const encryptedPrivate = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    new TextEncoder().encode(JSON.stringify(privateJwk)),
  );
  return {
    publicKey: JSON.stringify(publicJwk),
    privateKey: JSON.stringify(privateJwk),
    encryptedPrivateKey: bytesToBase64(encryptedPrivate),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    version: 1,
  };
}

async function unwrapPrivateKey(bundle: KeyBundle, password: string) {
  if (!bundle.encryptedPrivateKey || !bundle.salt || !bundle.iv) throw new Error("Secure messaging key is incomplete");
  const salt = base64ToBuffer(bundle.salt);
  const iv = base64ToBuffer(bundle.iv);
  const wrappingKey = await deriveWrappingKey(password, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      wrappingKey,
      base64ToBuffer(bundle.encryptedPrivateKey),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("Could not unlock secure messages with this password");
  }
}

export async function prepareSecureMessaging(api: ApiFn, password: string, userId: string) {
  const bundle: KeyBundle = await api("/crypto/me");
  if (bundle.configured) {
    const privateKey = await unwrapPrivateKey(bundle, password);
    sessionStorage.setItem(`${PRIVATE_PREFIX}${userId}`, privateKey);
    if (bundle.publicKey) localStorage.setItem(`${PUBLIC_PREFIX}${userId}`, bundle.publicKey);
    return { ready: true, created: false };
  }

  const identity = await createIdentity(password);
  await api("/crypto/me", {
    method: "PUT",
    body: JSON.stringify({
      publicKey: identity.publicKey,
      encryptedPrivateKey: identity.encryptedPrivateKey,
      salt: identity.salt,
      iv: identity.iv,
      version: identity.version,
    }),
  });
  sessionStorage.setItem(`${PRIVATE_PREFIX}${userId}`, identity.privateKey);
  localStorage.setItem(`${PUBLIC_PREFIX}${userId}`, identity.publicKey);
  return { ready: true, created: true };
}

export async function unlockSecureMessaging(api: ApiFn, password: string, userId: string) {
  return prepareSecureMessaging(api, password, userId);
}

export function secureMessagingUnlocked(userId: string) {
  return Boolean(sessionStorage.getItem(`${PRIVATE_PREFIX}${userId}`));
}

export async function myPublicKey(api: ApiFn, userId: string) {
  const cached = localStorage.getItem(`${PUBLIC_PREFIX}${userId}`);
  if (cached) return cached;
  const bundle: KeyBundle = await api("/crypto/me");
  if (!bundle.publicKey) throw new Error("Secure messaging is not configured");
  localStorage.setItem(`${PUBLIC_PREFIX}${userId}`, bundle.publicKey);
  return bundle.publicKey;
}

async function importPublicKey(publicKey: string) {
  return crypto.subtle.importKey(
    "jwk",
    JSON.parse(publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

async function importPrivateKey(privateKey: string) {
  return crypto.subtle.importKey(
    "jwk",
    JSON.parse(privateKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}

export async function encryptMessage(text: string, senderPublicKey: string, recipientPublicKey: string) {
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = randomBuffer(12);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(text));
  const rawAes = await crypto.subtle.exportKey("raw", aes);
  const [senderPublic, recipientPublic] = await Promise.all([importPublicKey(senderPublicKey), importPublicKey(recipientPublicKey)]);
  const [senderKey, recipientKey] = await Promise.all([
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, senderPublic, rawAes),
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublic, rawAes),
  ]);
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    senderKey: bytesToBase64(senderKey),
    recipientKey: bytesToBase64(recipientKey),
    encryptionVersion: 1,
  };
}

export async function decryptMessage(message: any, userId: string) {
  if (!message.encrypted) return message.body || "";
  const privateJwk = sessionStorage.getItem(`${PRIVATE_PREFIX}${userId}`);
  if (!privateJwk) throw new Error("Secure messages are locked");
  if (!message.wrappedKey || !message.ciphertext || !message.iv) throw new Error("Encrypted message is incomplete");
  const privateKey = await importPrivateKey(privateJwk);
  const rawAes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, base64ToBuffer(message.wrappedKey));
  const aes = await crypto.subtle.importKey("raw", rawAes, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBuffer(message.iv) }, aes, base64ToBuffer(message.ciphertext));
  return new TextDecoder().decode(plain);
}
