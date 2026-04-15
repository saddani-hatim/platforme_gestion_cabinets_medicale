const { sendEmail } = require('../services/emailService');
const { sendMessage, getStatus } = require('../services/whatsappService');

const validateEmail = (email) => {
    return String(email)
        .toLowerCase()
        .match(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/);
};

const validatePhone = (phone) => {
    // Basic validation for numbers starting with 212 (Morocco) or just digits
    return /^\d{10,14}$/.test(phone);
};

const sendNotification = async (req, res) => {
    const { type, to, subject, message, html } = req.body;

    if (!type || !to || !message) {
        return res.status(400).json({
            success: false,
            error: 'Missing type, to or message'
        });
    }

    try {
        let result;
        if (type === 'email') {
            if (!validateEmail(to)) {
                return res.status(400).json({ success: false, error: 'Invalid email format' });
            }
            result = await sendEmail(to, subject || 'Notification Cabinet Médical', message, html);
        } else if (type === 'whatsapp') {
            if (!validatePhone(to)) {
                return res.status(400).json({ success: false, error: 'Invalid phone format (must be 10-14 digits)' });
            }
            result = await sendMessage(to, message);
        } else {
            return res.status(400).json({ success: false, error: 'Invalid notification type. Use "email" or "whatsapp"' });
        }

        if (result.success) {
            res.json({ success: true, data: result });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Notification Controller Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

const checkStatus = (req, res) => {
    const wsStatus = getStatus();
    res.json({
        whatsapp: wsStatus.isReady ? 'ready' : 'not_initialized',
        service: 'running'
    });
};

module.exports = { sendNotification, checkStatus };
