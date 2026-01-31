/**
 * RS256 Key Pair Generator for JWT Authentication
 * Run with: npm run generate:keys
 */

const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.join(__dirname, '..', 'keys');

// Create keys directory if it doesn't exist
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

console.log('Generating RS256 key pair for JWT authentication...\n');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

const publicKeyPath = path.join(keysDir, 'public.pem');
const privateKeyPath = path.join(keysDir, 'private.pem');

fs.writeFileSync(publicKeyPath, publicKey);
fs.writeFileSync(privateKeyPath, privateKey);

console.log('✓ Keys generated successfully!\n');
console.log(`  Public key:  ${publicKeyPath}`);
console.log(`  Private key: ${privateKeyPath}`);
console.log('\n⚠️  Keep your private key secure and never commit it to version control!');
