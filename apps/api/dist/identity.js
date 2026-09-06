import { createHash } from "node:crypto";
export function hashIdentityReference(reference) {
    return createHash("sha256")
        .update(`abbasiconnect:v1:${reference}`)
        .digest("hex");
}
export function makeUsername(displayName, identityHash) {
    const base = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 18) || "abbasi";
    return `${base}${identityHash.slice(0, 6)}`;
}
