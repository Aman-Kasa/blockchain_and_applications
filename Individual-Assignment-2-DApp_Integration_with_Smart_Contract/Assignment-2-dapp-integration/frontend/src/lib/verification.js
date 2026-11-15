// Logic behind the public verification page. It calls the registry's free,
// read-only verifyLogoIntegrity() and turns the answer into a result a
// non-technical visitor can understand at a glance. No library imports, so the Hardhat
// tests run exactly this code against a real deployed contract.

import { friendlyError } from "./errors.js";

export const RESULT_COPY = {
  authentic: {
    headline: "Logo Verified: This is the authentic ALU logo",
    detail: "This file is identical, byte for byte, to the logo ALU registered on the blockchain.",
  },
  mismatch: {
    headline: "Warning: This logo has been modified",
    detail: "This file does not match the logo ALU registered. It may have been edited, recompressed or faked, so don't treat it as an official ALU logo.",
  },
  "not-found": {
    headline: "No registered logo found",
    detail: "There is no asset registered under that token ID, so there is nothing to compare against.",
  },
  invalid: {
    headline: "That doesn't look like a valid fingerprint",
    detail: "A SHA-256 fingerprint is 64 characters made of the digits 0-9 and letters a-f. Check you copied all of it.",
  },
  error: {
    headline: "We couldn't check this logo right now",
    detail: "",
  },
};

/** Convert the contract's AssetMetadata struct into display-friendly values. */
export function toAssetView(asset) {
  return {
    name: asset.name,
    fileType: asset.fileType,
    contentHash: asset.contentHash,
    registeredBy: asset.registeredBy,
    registeredAt: new Date(Number(asset.timestamp) * 1000),
  };
}

/**
 * Verify a hash against a registered token.
 * @param registry  ethers Contract for ALUAssetRegistry (a read-only provider is enough)
 * @param tokenId   token ID of the official logo
 * @param contentHash bytes32 SHA-256 hash of the file being checked, or null if invalid
 * @returns {Promise<{status: string, headline: string, detail: string, asset?: object, contractMessage?: string}>}
 */
export async function verifyLogo(registry, tokenId, contentHash) {
  if (!contentHash) return { status: "invalid", ...RESULT_COPY.invalid };

  try {
    const [isAuthentic, contractMessage] = await registry.verifyLogoIntegrity(tokenId, contentHash);
    if (!isAuthentic) return { status: "mismatch", ...RESULT_COPY.mismatch, contractMessage };

    const asset = toAssetView(await registry.getAsset(tokenId));
    return { status: "authentic", ...RESULT_COPY.authentic, contractMessage, asset };
  } catch (err) {
    const { code, message } = friendlyError(err);
    if (code === "not-found") return { status: "not-found", ...RESULT_COPY["not-found"] };
    return { status: "error", ...RESULT_COPY.error, detail: message };
  }
}
