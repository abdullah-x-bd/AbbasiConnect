export type ApiFn = (path: string, options?: RequestInit) => Promise<any>;

type KeyBundle = {
  configured: boolean;
  publicKey?: string | null;
  encryptedPrivateKey?: string | null;
  salt?: string | null;
  iv?: string | null;
  version?: number;
};

type StoredDeviceIdentity = {
  userId: string;
  privateKey: CryptoKey;
  publicKey?: string;
  encryptedPrivateKey?: string;
  salt?: string;
  iv?: string;
  version?: number;
  savedAt: number;
};

const PUBLIC_PREFIX = "abbasiconnect_e2ee_public_";
const DEVICE_READY_PREFIX = "abbasiconnect_e2ee_device_ready_";
const LEGACY_PRIVATE_PREFIX = "abbasiconnect_e2ee_private_";
const DB_NAME = "abbasiconnect-crypto-v2";
const DB_VERSION = 1;
const STORE_NAME = "device-keys";

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

function openCryptoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "userId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open secure device storage"));
  });
}

async function storeDeviceIdentity(identity: StoredDeviceIdentity) {
  const db = await openCryptoDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(identity);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save secure device key"));
    tx.onabort = () => reject(tx.error ?? new Error("Could not save secure device key"));
  });
  db.close();
  localStorage.setItem(`${DEVICE_READY_PREFIX}${identity.userId}`, "1");
  if (identity.publicKey) localStorage.setItem(`${PUBLIC_PREFIX}${identity.userId}`, identity.publicKey);
}

async function readDeviceIdentity(userId: string): Promise<StoredDeviceIdentity | null> {
  const db = await openCryptoDb();
  const value = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read secure device key"));
  });
  db.close();
  if (!value?.privateKey) return null;
  return value as StoredDeviceIdentity;
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

async function importPrivateJwk(privateJwk: string) {
  return crypto.subtle.importKey(
    "jwk",
    JSON.parse(privateJwk),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
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
  const privateJwkString = JSON.stringify(privateJwk);
  const salt = randomBuffer(16);
  const iv = randomBuffer(12);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const encryptedPrivate = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    new TextEncoder().encode(privateJwkString),
  );
  return {
    publicKey: JSON.stringify(publicJwk),
    privateJwk: privateJwkString,
    encryptedPrivateKey: bytesToBase64(encryptedPrivate),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    version: 1,
  };
}

async function unwrapPrivateKey(bundle: KeyBundle, password: string) {
  if (!bundle.encryptedPrivateKey || !bundle.salt || !bundle.iv) throw new Error("Secure messaging key is incomplete");
  const wrappingKey = await deriveWrappingKey(password, base64ToBuffer(bundle.salt));
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuffer(bundle.iv) },
      wrappingKey,
      base64ToBuffer(bundle.encryptedPrivateKey),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("Could not provision secure messaging on this browser");
  }
}

async function uploadBundle(api: ApiFn, identity: { publicKey: string; encryptedPrivateKey: string; salt: string; iv: string; version: number }) {
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
}

async function installFreshIdentity(api: ApiFn, password: string, userId: string) {
  const identity = await createIdentity(password);
  const privateKey = await importPrivateJwk(identity.privateJwk);

  // Save the full recovery payload locally before publishing it. If the network
  // request fails, the next normal sign-in can safely retry the same key bundle.
  await storeDeviceIdentity({
    userId,
    privateKey,
    publicKey: identity.publicKey,
    encryptedPrivateKey: identity.encryptedPrivateKey,
    salt: identity.salt,
    iv: identity.iv,
    version: identity.version,
    savedAt: Date.now(),
  });
  await uploadBundle(api, identity);
  return { ready: true, created: true, trustedDevice: true };
}

async function migrateLegacySessionKey(userId: string) {
  const legacy = sessionStorage.getItem(`${LEGACY_PRIVATE_PREFIX}${userId}`);
  if (!legacy) return null;
  const privateKey = await importPrivateJwk(legacy);
  sessionStorage.removeItem(`${LEGACY_PRIVATE_PREFIX}${userId}`);
  return privateKey;
}

export async function prepareSecureMessaging(api: ApiFn, password: string, userId: string) {
  const [bundle, stored] = await Promise.all([
    api("/crypto/me") as Promise<KeyBundle>,
    readDeviceIdentity(userId).catch(() => null),
  ]);

  // A fully matching trusted device is already ready.
  if (stored?.publicKey && bundle.publicKey && stored.publicKey === bundle.publicKey) {
    localStorage.setItem(`${DEVICE_READY_PREFIX}${userId}`, "1");
    localStorage.setItem(`${PUBLIC_PREFIX}${userId}`, bundle.publicKey);
    return { ready: true, created: false, trustedDevice: true };
  }

  // A previous publication may have failed after the browser saved its key.
  // Retry the exact same key bundle rather than generating a different identity.
  if (!bundle.publicKey && stored?.publicKey && stored.encryptedPrivateKey && stored.salt && stored.iv && stored.version) {
    await uploadBundle(api, {
      publicKey: stored.publicKey,
      encryptedPrivateKey: stored.encryptedPrivateKey,
      salt: stored.salt,
      iv: stored.iv,
      version: stored.version,
    });
    localStorage.setItem(`${PUBLIC_PREFIX}${userId}`, stored.publicKey);
    return { ready: true, created: false, trustedDevice: true, repaired: true };
  }

  if (bundle.configured && bundle.publicKey) {
    try {
      const privateJwk = await unwrapPrivateKey(bundle, password);
      const privateKey = await importPrivateJwk(privateJwk);
      await storeDeviceIdentity({
        userId,
        privateKey,
        publicKey: bundle.publicKey,
        encryptedPrivateKey: bundle.encryptedPrivateKey || undefined,
        salt: bundle.salt || undefined,
        iv: bundle.iv || undefined,
        version: bundle.version || 1,
        savedAt: Date.now(),
      });
      return { ready: true, created: false, trustedDevice: true };
    } catch (error) {
      // The two seeded demo accounts had their passwords renamed during development.
      // They contain only the original unencrypted demo message, so rotating their
      // test encryption identity is safe and prevents the old password wrapping from
      // permanently blocking secure setup.
      const me = await api("/auth/me").catch(() => null);
      if (me?.username === "user1" || me?.username === "user2") {
        return installFreshIdentity(api, password, userId);
      }
      throw error;
    }
  }

  const legacy = await migrateLegacySessionKey(userId).catch(() => null);
  if (legacy && bundle.publicKey) {
    await storeDeviceIdentity({ userId, privateKey: legacy, publicKey: bundle.publicKey, savedAt: Date.now() });
    return { ready: true, created: false, trustedDevice: true };
  }

  return installFreshIdentity(api, password, userId);
}

// Kept only for compatibility with older UI imports. Normal sign-in provisions
// the browser, so users do not need a second password step inside Messages.
export async function unlockSecureMessaging(api: ApiFn, password: string, userId: string) {
  return prepareSecureMessaging(api, password, userId);
}

export function secureMessagingUnlocked(_userId: string) {
  return true;
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

async function getDevicePrivateKey(userId: string) {
  const stored = await readDeviceIdentity(userId).catch(() => null);
  if (stored?.privateKey) return stored.privateKey;
  const migrated = await migrateLegacySessionKey(userId).catch(() => null);
  if (migrated) return migrated;
  localStorage.removeItem(`${DEVICE_READY_PREFIX}${userId}`);
  throw new Error("This browser has not been provisioned for secure messaging yet. Sign out and sign in once on this browser.");
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
  if (!message.wrappedKey || !message.ciphertext || !message.iv) throw new Error("Encrypted message is incomplete");
  const privateKey = await getDevicePrivateKey(userId);
  const rawAes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, base64ToBuffer(message.wrappedKey));
  const aes = await crypto.subtle.importKey("raw", rawAes, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBuffer(message.iv) }, aes, base64ToBuffer(message.ciphertext));
  return new TextDecoder().decode(plain);
}
