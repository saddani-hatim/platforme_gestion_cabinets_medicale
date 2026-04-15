import express from 'express';
import { register, verifyCode, login, refresh, logout, forgotPassword, verifyResetCode, resetPassword } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/verify', verifyCode);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Forgot password flow
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);

export default router;
