import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

/**
 * ====================================================================
 * 📧 Email Service with Nodemailer & Safe Fallback
 * ====================================================================
 * Sends branded OTP emails for Forgot Password & Change Password.
 * If SMTP is not yet configured in .env, it safely logs the OTP
 * to server console so development and testing can proceed seamlessly.
 * ====================================================================
 */

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (config.email.user && config.email.pass) {
    const isGmail = config.email.host?.includes('gmail') || config.email.user?.includes('@gmail.com');
    
    if (isGmail) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: config.email.user,
          pass: config.email.pass,
        },
      });
    } else if (config.email.host) {
      transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.pass,
        },
      });
    }
  }
  return transporter;
};

/**
 * Send 6-Digit OTP Email
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.userName - Recipient name
 * @param {string} params.otp - 6 digit OTP string
 * @param {string} params.type - 'forgot_password' | 'change_password'
 */
export async function sendOtpEmail({ toEmail, userName = 'User', otp, type = 'forgot_password' }) {
  const isForgotPassword = type === 'forgot_password';
  const subject = isForgotPassword
    ? `🔐 [Faizan Body] Password Reset OTP: ${otp}`
    : `🛡️ [Faizan Body] Change Password Verification OTP: ${otp}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .email-container { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
        .header { background: #0f172a; padding: 28px 24px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
        .header p { color: #94a3b8; margin: 6px 0 0; font-size: 13px; }
        .content { padding: 32px 24px; text-align: center; }
        .badge { display: inline-block; background: #eff6ff; color: #2563eb; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; margin-bottom: 16px; text-transform: uppercase; }
        .title { font-size: 18px; font-weight: 700; margin: 0 0 10px; color: #0f172a; }
        .desc { font-size: 14px; color: #64748b; line-height: 1.5; margin: 0 0 24px; }
        .otp-box { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 18px 24px; display: inline-block; margin-bottom: 24px; }
        .otp-number { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0f172a; font-family: monospace; }
        .warning { font-size: 12px; color: #dc2626; margin: 0 0 16px; background: #fef2f2; padding: 8px 12px; border-radius: 8px; }
        .footer { background: #f8fafc; padding: 18px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>FAIZAN BODY BUILD</h1>
          <p>Security & Verification Portal</p>
        </div>
        <div class="content">
          <div class="badge">${isForgotPassword ? 'Password Reset' : 'Change Password'}</div>
          <h2 class="title">Hello ${userName},</h2>
          <p class="desc">
            You requested an OTP verification for your <strong>Faizan Body</strong> account. 
            Use the 6-digit code below to proceed:
          </p>
          <div class="otp-box">
            <span class="otp-number">${otp}</span>
          </div>
          <p class="warning">
            ⚠️ This OTP is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
          </p>
        </div>
        <div class="footer">
          If you did not request this, please ignore this email or contact the administrator.
        </div>
      </div>
    </body>
    </html>
  `;

  // Always log clearly to server console for instant dev testing
  console.log('\n======================================================');
  console.log(`🔐 [EMAIL OTP SERVICE]`);
  console.log(`📬 Recipient: ${toEmail} (${userName})`);
  console.log(`🔑 6-Digit OTP: ${otp}`);
  console.log(`⏳ Valid For: 10 minutes`);
  console.log(`📋 Purpose: ${type}`);
  console.log('======================================================\n');

  const activeTransporter = getTransporter();

  if (activeTransporter) {
    try {
      const info = await activeTransporter.sendMail({
        from: config.email.from,
        to: toEmail,
        subject,
        html: htmlContent,
      });
      console.log(`✅ [Nodemailer] Email sent successfully to ${toEmail}: ${info.messageId}`);
      return { success: true, delivered: true, messageId: info.messageId };
    } catch (mailError) {
      console.warn(`⚠️ [Nodemailer Error]: ${mailError.message}`);
      console.warn('   OTP logged in console above for seamless development.\n');
      return { success: true, delivered: false, error: mailError.message, devOtp: otp };
    }
  } else {
    console.log(`ℹ️ [Email Notice]: SMTP credentials not set in .env. Using simulated OTP mode.`);
    return { success: true, delivered: false, simulated: true, devOtp: otp };
  }
}

export default {
  sendOtpEmail,
};
