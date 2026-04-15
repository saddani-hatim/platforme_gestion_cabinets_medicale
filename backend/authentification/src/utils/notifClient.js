// notifClient.js
import path from 'path';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// URL du service gRPC notification
const NOTIF_GRPC_URL = process.env.NOTIF_GRPC_URL || 'localhost:50051';
const PROTO_PATH = path.join(__dirname, '../../../../backend/proto/notification.proto');

// Chargement du proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const notificationProto = grpc.loadPackageDefinition(packageDefinition).notification;

// Client gRPC
const client = new notificationProto.NotificationService(
  NOTIF_GRPC_URL,
  grpc.credentials.createInsecure()
);

/**
 * Envoie une notification (Email ou WhatsApp) via gRPC
 * @param {Object} payload - { type, to, message, subject?, html? }
 */
export const sendNotification = async (payload) => {
  // Create a standardized payload for HMAC calculation
  const hmacPayload = {
    type: payload.type || '',
    to: payload.to || '',
    message: payload.message || '',
    subject: payload.subject || '',
    html: payload.html || ''
  };

  const hmac = crypto.createHmac('sha256', process.env.HMAC_SECRET || 'secret')
    .update(JSON.stringify(hmacPayload))
    .digest('hex');

  const metadata = new grpc.Metadata();
  metadata.add('x-hmac-signature', hmac);

  return new Promise((resolve) => {
    client.SendNotification(payload, metadata, (error, response) => {
      if (error) {
        console.error('gRPC Error:', error);
        resolve({ success: false, error: error.message });
      } else {
        resolve(response);
      }
    });
  });
};

/**
 * Envoie un code de vérification par Email et WhatsApp
 * @param {Object} targets - { email: string, phone?: string }
 * @param {string} code - code à 6 chiffres
 */
export const sendVerificationCode = async ({ email, phone }, code) => {
  const message = `Votre code de vérification pour le Cabinet Médical est : ${code}. Ce code expire dans 15 minutes.`;
  const subject = 'Code de vérification - Cabinet Médical';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #2563eb;">Vérification de votre compte</h2>
      <p>Bonjour,</p>
      <p>Merci de vous être inscrit. Voici votre code de vérification :</p>
      <div style="font-size: 24px; font-weight: bold; padding: 10px; background: #f3f4f6; text-align: center; border-radius: 5px; letter-spacing: 5px;">
          ${code}
      </div>
      <p>Ce code est valable pendant 15 minutes.</p>
      <p>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">Cabinet Médical - Système de gestion</p>
    </div>
  `;

  const promises = [];

  // Toujours envoyer Email
  promises.push(sendNotification({
    type: 'email',
    to: email,
    message,
    subject,
    html
  }));

  // Envoyer WhatsApp si téléphone fourni
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    promises.push(sendNotification({
      type: 'whatsapp',
      to: cleanPhone,
      message
    }));
  }

  const results = await Promise.all(promises);

  return {
    success: results.some(r => r.success),
    email_sent: results[0]?.success,
    whatsapp_sent: phone ? results[1]?.success : false,
    errors: results.filter(r => !r.success).map(r => r.error)
  };
};