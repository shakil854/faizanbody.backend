import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  isProduction: process.env.NODE_ENV === 'production',

  // MySQL Database Configuration
  db: {
    host: process.env.DB_HOST || '200.141.8.22',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'faizanbody',
    password: process.env.DB_PASSWORD || 'faizanbody',
    database: process.env.DB_NAME || 'faizanbody',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    waitForConnections: true,
    queueLimit: 0,
  },

  // JWT Authentication Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'faizanbody_super_secret_jwt_key_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // SMTP Email Configuration for OTP Delivery
  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || 'syncrobytetech@gmail.com',
    pass: process.env.SMTP_PASS || 'jout doab oauq srhs',
    from: process.env.SMTP_FROM || 'Faizan Body Build <noreply@faizanbody.com>',
  },

  // Cloudflare R2 Storage Configuration
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '656973beb479306ad97b9b3f65bc7137',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '5bdcefdba2f4bc3f080d7504dd4e6a07',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '960ded64be5d045b67d26ca7f83b426bbba073e35541e51620da1f3fea2eef75',
    bucketName: process.env.R2_BUCKET_NAME || 'fizanbody',
    endpoint: process.env.R2_ENDPOINT || 'https://656973beb479306ad97b9b3f65bc7137.r2.cloudflarestorage.com',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },
};

