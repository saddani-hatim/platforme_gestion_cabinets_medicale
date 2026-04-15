import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to keys relative to this file
// Project root/keys/
const privateKeyPath = path.join(__dirname, '../../keys/private.pem');
const publicKeyPath = path.join(__dirname, '../../keys/public.pem');

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

/**
 * Signs an Access Token using RS256
 */
export const signAccessToken = (payload) => {
    return jwt.sign(payload, privateKey, {
        algorithm: 'RS256',
        expiresIn: '5m', // 5 minutes as requested
    });
};

/**
 * Verifies an Access Token using RS256
 */
export const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    } catch (error) {
        return null;
    }
};

/**
 * Generates an opaque Refresh Token (userId.16bytes_hex)
 */
export const generateOpaqueToken = (userId) => {
    const opaque = crypto.randomBytes(16).toString('hex');
    return userId ? `${userId}.${opaque}` : opaque;
};
