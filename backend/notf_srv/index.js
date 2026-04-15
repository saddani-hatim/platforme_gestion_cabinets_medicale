require('dotenv').config();
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const crypto = require('crypto');
const { sendEmail } = require('./src/services/emailService');
const { sendMessage, shutdown: shutdownWhatsApp } = require('./src/services/whatsappService');

// gRPC Config
const GRPC_PORT = process.env.GRPC_PORT || 50051;
const PROTO_PATH = path.join(__dirname, '../proto/notification.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const notificationProto = grpc.loadPackageDefinition(packageDefinition).notification;

/**
 * gRPC Service Implementation
 */
const sendNotificationGrpc = async (call, callback) => {
  const { type, to, subject, message, html } = call.request;
  const signature = call.metadata.get('x-hmac-signature')[0];

  if (!signature) {
    console.error('HMAC Signature missing');
    return callback(null, { success: false, error: 'Unauthorized: HMAC Signature missing' });
  }

  // Create a standardized payload for HMAC verification (matching the client's payload)
  const hmacPayload = {
    type: call.request.type || '',
    to: call.request.to || '',
    message: call.request.message || '',
    subject: call.request.subject || '',
    html: call.request.html || ''
  };

  const expectedHmac = crypto.createHmac('sha256', process.env.HMAC_SECRET || 'secret')
    .update(JSON.stringify(hmacPayload))
    .digest('hex');

  if (signature !== expectedHmac) {
    console.error('HMAC Signature mismatch');
    return callback(null, { success: false, error: 'Unauthorized: HMAC Signature mismatch' });
  }

  try {
    let result;
    if (type === 'email') {
      result = await sendEmail(to, subject, message, html);
    } else if (type === 'whatsapp') {
      result = await sendMessage(to, message);
    } else {
      return callback(null, { success: false, error: 'Invalid type' });
    }
    callback(null, result);
  } catch (error) {
    callback(null, { success: false, error: error.message });
  }
};

/**
 * Start gRPC Server
 */
const startGrpcServer = () => {
  const server = new grpc.Server();
  server.addService(notificationProto.NotificationService.service, {
    SendNotification: sendNotificationGrpc
  });

  server.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('gRPC Bind Error:', err);
      return;
    }
    console.log(`gRPC Server running on port ${port}`);
  });
};

// Start the gRPC server
startGrpcServer();

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down Notification Service...');
  await shutdownWhatsApp();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);