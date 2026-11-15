// In-browser SHA-256 hashing.
//
// The file never leaves the user's computer: we read its bytes locally and hash
// them with the Web Crypto API (crypto.subtle), which every modern browser and
// Node.js 20+ provide. No server and no extra library is involved.
//
// This module has no imports on purpose, so the Hardhat tests can load the
// exact same code the browser runs.

/** Read a File/Blob into an ArrayBuffer using the FileReader API (browser),
 *  falling back to Blob.arrayBuffer() where FileReader does not exist (Node). */
export function readFileBytes(file) {
  if (typeof FileReader !== "undefined" && file instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
      reader.readAsArrayBuffer(file);
    });
  }
  if (typeof file?.arrayBuffer === "function") return file.arrayBuffer();
  if (file instanceof ArrayBuffer || ArrayBuffer.isView(file)) return Promise.resolve(file);
  return Promise.reject(new TypeError("Expected a File, Blob, ArrayBuffer or typed array."));
}

/** Turn raw digest bytes into a 0x-prefixed hex string (32 bytes = bytes32). */
export function bytesToBytes32(bytes) {
  const hex = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}

/**
 * Hash a file with SHA-256 and return it formatted as a Solidity bytes32
 * value: "0x" followed by 64 lowercase hex characters.
 */
export async function hashFile(file) {
  const bytes = await readFileBytes(file);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return bytesToBytes32(digest);
}

/**
 * Clean up a hash a user pasted (spaces, uppercase, missing 0x) and check it is
 * a valid SHA-256 / bytes32 value. Returns the normalised hash, or null.
 */
export function normalizeHash(input) {
  const hex = String(input ?? "").trim().replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? "0x" + hex : null;
}

/** True if value is already a correctly formatted bytes32 hash. */
export function isBytes32(value) {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
}
