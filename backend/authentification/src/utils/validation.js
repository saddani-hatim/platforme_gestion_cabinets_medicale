import { z } from 'zod';

/**
 * Common regex for phone numbers (International format)
 */
const phoneRegex = /^\+?[0-9]{10,15}$/;

/**
 * Registration Schema
 */
export const registerSchema = z.object({
    name: z.string().min(2, "Le nom doit comporter au moins 2 caractères").max(100),
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
    phone: z.string().regex(phoneRegex, "Format de téléphone invalide").optional().or(z.literal('')),
    password: z.string().min(8, "Le mot de passe doit comporter au moins 8 caractères"),
    role: z.enum(['USER', 'DOCTOR', 'RECEPTIONIST', 'ADMIN']).default('USER'),
});

/**
 * Login Schema
 */
export const loginSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
    password: z.string().min(1, "Le mot de passe est requis"),
});

/**
 * Verification Code Schema (Registration or Reset)
 */
export const verifyCodeSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
    code: z.string().length(6, "Le code doit comporter exactement 6 chiffres"),
});

/**
 * Forgot Password Schema
 */
export const forgotPasswordSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
});

/**
 * Reset Password Schema (Final Step)
 */
export const resetPasswordSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
    newPassword: z.string().min(8, "Le nouveau mot de passe doit comporter au moins 8 caractères"),
});

/**
 * Helper to format Zod errors for the Frontend
 */
export const formatZodError = (error) => {
    return {
        error: "Validation échouée",
        details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
        }))
    };
};
