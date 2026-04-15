import bcrypt from 'bcrypt';
import prisma from '../config/prisma.js';
import redis from '../config/redis.js';
import { signAccessToken, generateOpaqueToken } from '../utils/tokenUtils.js';
import { sendVerificationCode } from '../utils/notifClient.js';
import { 
    registerSchema, 
    loginSchema, 
    verifyCodeSchema, 
    forgotPasswordSchema, 
    resetPasswordSchema, 
    formatZodError 
} from '../utils/validation.js';
import { z } from 'zod';

/**
 * Redis Rate Limiter Helper
 */
const checkRateLimit = async (key, limit, windowSec) => {
    const current = await redis.incr(key);
    if (current === 1) {
        await redis.expire(key, windowSec);
    }
    if (current > limit) {
        const ttl = await redis.ttl(key);
        return { limited: true, retryAfter: ttl };
    }
    return { limited: false, retryAfter: 0 };
};

/**
 * Register - Step 1: Request verification code
 */
export const register = async (req, res) => {
    try {
        // Validation avec Zod
        const validated = registerSchema.parse(req.body);
        const { name, email, phone, password, role } = validated;

        // Check existing user
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Un compte existe déjà avec cet email' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 15);

        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.pendingUser.upsert({
            where: { email },
            update: { name, phone, password: hashedPassword, role, verification_code: verificationCode, expires_at: expiresAt },
            create: { name, email, phone, password: hashedPassword, role, verification_code: verificationCode, expires_at: expiresAt },
        });

        const notifResult = await sendVerificationCode({ email, phone }, verificationCode);

        res.status(200).json({
            message: 'Code de vérification envoyé',
            email,
            notif_status: notifResult
        });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(formatZodError(error));
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Verify code and create user
 */
export const verifyCode = async (req, res) => {
    try {
        const { email, code } = verifyCodeSchema.parse(req.body);

        const pending = await prisma.pendingUser.findUnique({ where: { email } });

        if (!pending || pending.verification_code !== code) {
            return res.status(400).json({ error: 'Code de vérification invalide' });
        }

        if (pending.expires_at < new Date()) {
            return res.status(400).json({ error: 'Code de vérification expiré' });
        }

        const user = await prisma.user.create({
            data: {
                name: pending.name,
                email: pending.email,
                phone: pending.phone,
                password: pending.password,
                role: pending.role,
            }
        });

        await prisma.pendingUser.delete({ where: { email } });

        res.status(201).json({ message: 'Compte créé avec succès', userId: user.id });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(formatZodError(error));
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Login
 */
export const login = async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Rate limit par IP et Email
        const ipLimit = await checkRateLimit(`rl:login:ip:${ip}`, 5, 300);
        if (ipLimit.limited) return res.status(429).json({ error: `Trop de tentatives (IP). Attendez ${Math.ceil(ipLimit.retryAfter / 60)} min.` });

        const emailLimit = await checkRateLimit(`rl:login:email:${email}`, 5, 300);
        if (emailLimit.limited) return res.status(429).json({ error: `Compte bloqué temporairement. Attendez ${Math.ceil(emailLimit.retryAfter / 60)} min.` });

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        // Reset rate limits on success
        await redis.del(`rl:login:ip:${ip}`);
        await redis.del(`rl:login:email:${email}`);

        const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });
        const opaqueRefreshToken = generateOpaqueToken(user.id);
        const hashedRefreshToken = await bcrypt.hash(opaqueRefreshToken, 10);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.upsert({
            where: { userId: user.id },
            update: { token: hashedRefreshToken, expires_at: expiresAt },
            create: { token: hashedRefreshToken, userId: user.id, expires_at: expiresAt },
        });

        // Gateway will handle the cookies
        res.json({
            message: 'Login successful',
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
            accessToken,
            refreshToken: opaqueRefreshToken
        });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(formatZodError(error));
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Refresh Tokens
 */
export const refresh = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) return res.status(401).json({ error: 'Refresh token manquant' });

        // Grace period check (Redis)
        const graceKey = `auth:grace:${refreshToken}`;
        const graceData = await redis.get(graceKey);
        if (graceData) {
            const data = JSON.parse(graceData);
            return res.json({ message: 'Tokens refreshed (grace)', ...data });
        }

        // Optimized lookup
        const [userIdStr] = refreshToken.split('.');
        const userId = parseInt(userIdStr);
        if (isNaN(userId)) return res.status(403).json({ error: 'Token invalide' });

        const dbToken = await prisma.refreshToken.findUnique({ where: { userId }, include: { user: true } });
        if (!dbToken || dbToken.expires_at <= new Date() || !(await bcrypt.compare(refreshToken, dbToken.token))) {
            return res.status(403).json({ error: 'Token invalide ou expiré' });
        }

        // Rotation
        const newOpaqueToken = generateOpaqueToken(dbToken.user.id);
        const newHashedToken = await bcrypt.hash(newOpaqueToken, 10);
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 7);

        await prisma.refreshToken.update({
            where: { id: dbToken.id },
            data: { token: newHashedToken, expires_at: newExpiresAt },
        });

        const userPayload = { id: dbToken.user.id, name: dbToken.user.name, email: dbToken.user.email, role: dbToken.user.role };
        const newAccessToken = signAccessToken(userPayload);

        // Save for grace period
        await redis.set(graceKey, JSON.stringify({ user: userPayload, accessToken: newAccessToken, refreshToken: newOpaqueToken }), 'EX', 30);

        res.json({ message: 'Tokens refreshed', user: userPayload, accessToken: newAccessToken, refreshToken: newOpaqueToken });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Logout
 */
export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.cookies;
        if (refreshToken) {
            const [userIdStr] = refreshToken.split('.');
            const userId = parseInt(userIdStr);
            if (!isNaN(userId)) {
                await prisma.refreshToken.delete({ where: { userId } }).catch(() => {});
            }
        }
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Forgot Password - Step 1
 */
export const forgotPassword = async (req, res) => {
    try {
        const { email } = forgotPasswordSchema.parse(req.body);

        const rl = await checkRateLimit(`rl:forgot:${email}`, 3, 900);
        if (rl.limited) return res.status(429).json({ error: 'Trop de demandes. Réessayez plus tard.' });

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(200).json({ message: 'Si l\'email existe, un code a été envoyé' });

        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        await redis.set(`reset_pwd:${email}`, resetCode, 'EX', 900);
        await sendVerificationCode({ email, phone: user.phone }, resetCode);

        res.status(200).json({ message: 'Si l\'email existe, un code a été envoyé' });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(formatZodError(error));
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Verify Reset Code - Step 2
 */
export const verifyResetCode = async (req, res) => {
    try {
        const { email, code } = verifyCodeSchema.parse(req.body);
        const storedCode = await redis.get(`reset_pwd:${email}`);

        if (!storedCode || storedCode !== code) {
            return res.status(400).json({ error: 'Code invalide ou expiré' });
        }

        await redis.set(`reset_pwd_verified:${email}`, '1', 'EX', 300);
        await redis.del(`reset_pwd:${email}`);

        res.status(200).json({ message: 'Code vérifié' });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(formatZodError(error));
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Reset Password - Step 3
 */
export const resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = resetPasswordSchema.parse(req.body);
        const isVerified = await redis.get(`reset_pwd_verified:${email}`);

        if (!isVerified) return res.status(403).json({ error: 'Session expirée' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { email }, data: { password: hashedPassword } });

        await redis.del(`reset_pwd_verified:${email}`);
        await prisma.refreshToken.deleteMany({ where: { user: { email } } });

        res.status(200).json({ message: 'Mot de passe réinitialisé' });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(formatZodError(error));
        res.status(500).json({ error: 'Internal server error' });
    }
};
