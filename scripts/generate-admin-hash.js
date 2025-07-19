#!/usr/bin/env node

/**
 * Admin Password Hash Generator
 *
 * This script generates a SHA-256 hash of your admin password.
 * Usage: node scripts/generate-admin-hash.js [password]
 *
 * The generated hash should be set as NEXT_PUBLIC_ADMIN_PASSWORD_HASH
 * in your .env.local file.
 */

const crypto = require("crypto");

function generateHash(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Get password from command line argument or prompt
const password = process.argv[2];

if (!password) {
  console.log("\n🔐 Admin Password Hash Generator");
  console.log("================================\n");
  console.log(
    "Usage: node scripts/generate-admin-hash.js [your-admin-password]\n"
  );
  console.log(
    "Example: node scripts/generate-admin-hash.js mySecurePassword123\n"
  );
  console.log("⚠️  Warning: Make sure to use a strong password!\n");
  process.exit(1);
}

const hash = generateHash(password);

console.log("\n🔐 Admin Password Hash Generated");
console.log("================================\n");
console.log("Add this to your .env.local file:\n");
console.log(`NEXT_PUBLIC_ADMIN_PASSWORD_HASH=${hash}\n`);
console.log("⚠️  Security Notes:");
console.log(
  "- Keep your .env.local file secure and never commit it to version control"
);
console.log(
  "- Use a strong password with letters, numbers, and special characters"
);
console.log("- Consider rotating the password periodically");
console.log(
  "- This hash will be visible in the client-side bundle (this is expected for this approach)\n"
);
