const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let isReady = false;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: '/usr/bin/google-chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--mute-audio',
            '--disable-web-security'
        ],
        headless: 'new' // specifically use the new headless mode 
    }
});

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED. SCAN WITH WHATSAPP APP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    isReady = true;
});

client.on('authenticated', () => {
    console.log('WhatsApp Authenticated successfully');
});

client.on('auth_failure', (msg) => {
    console.error('WhatsApp Auth failure:', msg);
    isReady = false;
});

client.on('remote_session_saved', () => {
    console.log('WhatsApp Session saved');
});

client.on('disconnected', () => {
    console.log('WhatsApp Client disconnected');
    isReady = false;
});

const sendMessage = async (number, message, attempt = 1) => {
    if (!isReady) {
        return { success: false, error: 'WhatsApp client is not ready. Please scan QR code.' };
    }
    try {
        // Formatting number: should be in format 212600000000@c.us
        let cleanNumber = number.replace(/\D/g, '');

        // Handle Moroccan numbers starting with 06 or 07
        if (cleanNumber.startsWith('06') || cleanNumber.startsWith('07')) {
            cleanNumber = '212' + cleanNumber.substring(1);
        }

        const formattedNumber = cleanNumber.includes('@c.us') ? cleanNumber : `${cleanNumber}@c.us`;
        const response = await client.sendMessage(formattedNumber, message);
        return { success: true, response };
    } catch (error) {
        console.error(`Error sending WhatsApp message (Attempt ${attempt}):`, error);

        // Check for "detached Frame" error and retry once
        if (error.message.includes('detached Frame') && attempt < 2) {
            console.warn('Detached frame detected, retrying after delay...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return sendMessage(number, message, attempt + 1);
        }

        return { success: false, error: error.message };
    }
};

const getStatus = () => ({ isReady });

const shutdown = async () => {
    console.log('Shutting down WhatsApp client...');
    try {
        await client.destroy();
        console.log('WhatsApp client destroyed');
    } catch (error) {
        console.error('Error destroying WhatsApp client:', error);
    }
};

console.log('Initializing WhatsApp client...');
client.initialize().catch(err => {
    console.error('CRITICAL: WhatsApp initialization failed:', err);
});

module.exports = { sendMessage, getStatus, shutdown, client };
