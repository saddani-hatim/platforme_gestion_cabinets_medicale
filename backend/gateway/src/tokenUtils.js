import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to public key in authentification service
// في gateway/src/utils/tokenUtils.js
const publicKeyPath = path.join(__dirname, '../../authentification/keys/public.pem');
const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

/**
 * Verifies an Access Token using RS256
 * @param {string} token 
 * @returns {object|null} Decoded payload or null if invalid
 */
export const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    } catch (error) {
        console.error("❌ JWT Verification Error Details:", {
            message: error.message, // هل هو 'invalid signature' أم 'jwt expired'؟
            name: error.name,
            stack: error.stack
        });
        return null;
        return null;
    }
};
