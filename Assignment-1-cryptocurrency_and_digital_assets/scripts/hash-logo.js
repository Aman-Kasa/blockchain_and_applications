// Prints the SHA-256 hash of alu-logo.png in bytes32 format.
// Usage: node scripts/hash-logo.js [path/to/file]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = process.argv[2] || path.join(__dirname, "..", "alu-logo.png");
const hex = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

console.log("File:         ", path.resolve(file));
console.log("SHA-256:      ", hex);
console.log("bytes32 value:", "0x" + hex);
