import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

/**
 * ====================================================================
 * 📧 Email Service Optimized for 100% Primary Inbox Delivery
 * ====================================================================
 * - Clean transactional headers to prevent Gmail Spam filters
 * - Avoids emojis and raw numbers in subject line (major spam trigger)
 * - Professional layout with plain-text MIME multipart
 * ====================================================================
 */

const getTransporter = () => {
  const user = process.env.SMTP_USER || config.email.user;
  const rawPass = process.env.SMTP_PASS || config.email.pass;
  const pass = rawPass ? rawPass.replace(/\s+/g, '') : '';
  const host = process.env.SMTP_HOST || config.email.host;

  if (user && pass) {
    const isGmail = host?.includes('gmail') || user?.includes('@gmail.com');

    if (isGmail) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass,
        },
      });
    } else if (host) {
      return nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || config.email.port || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || config.email.secure,
        auth: {
          user,
          pass,
        },
      });
    }
  }
  return null;
};

/**
 * Send 6-Digit OTP Email (Optimized against Spam filters)
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.userName - Recipient name
 * @param {string} params.otp - 6 digit OTP string
 * @param {string} params.type - 'forgot_password' | 'change_password'
 */
export async function sendOtpEmail({ toEmail, userName = 'User', otp, type = 'forgot_password' }) {
  // Clean, professional subject without emojis or raw OTP digits (prevents Gmail spam classification)
  const subject = type === 'forgot_password'
    ? 'Faizan Body Account - Password Reset Verification Code'
    : 'Faizan Body Account - Security Verification Code';

  const plainText = [
    `Hello ${userName},`,
    '',
    `Your verification code for Faizan Body is: ${otp}`,
    '',
    'This code is valid for 10 minutes. Please enter this code in the application to complete your request.',
    '',
    'If you did not make this request, you can safely ignore this email.',
    '',
    'Best regards,',
    'Faizan Body Build Team'
  ].join('\n');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
        <!-- Header -->
        <tr>
          <td style="padding: 24px 30px; background-color: #1e293b; text-align: left;">
            <table border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align: middle;">
                  <span style="font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">FAIZAN BODY BUILD</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <!-- Content Body -->
        <tr>
          <td style="padding: 32px 30px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #111827;">Verification Code</h2>
            <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.5; color: #4b5563;">
              Hello ${userName},<br><br>
              We received a request to verify your <strong>Faizan Body</strong> account. Use the code below to complete your verification:
            </p>
            
            <!-- OTP Box -->
            <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
              <tr>
                <td style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 28px; text-align: center;">
                  <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1d4ed8;">${otp}</span>
                </td>
              </tr>
            </table>
            
            <p style="margin: 20px 0 0; font-size: 13px; line-height: 1.5; color: #6b7280;">
              This code will expire in <strong>10 minutes</strong>. If you did not initiate this request, no action is needed and your account remains safe.
            </p>
          </td>
        </tr>
        
        <!-- Footer -->
        <tr>
          <td style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af;">
            Faizan Body Workshop Management &bull; Automated Security Notification
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const activeTransporter = getTransporter();

  if (activeTransporter) {
    try {
      const senderUser = process.env.SMTP_USER || config.email.user;
      const fromHeader = `Faizan Body <${senderUser}>`;

      const info = await activeTransporter.sendMail({
        from: fromHeader,
        to: toEmail,
        replyTo: senderUser,
        subject,
        text: plainText,
        html: htmlContent,
        headers: {
          'X-Entity-Ref-ID': `${Date.now()}`,
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
        },
      });

      console.log(`\n✅ [Nodemailer LIVE] OTP Email sent successfully to ${toEmail} (ID: ${info.messageId})\n`);
      return { success: true, delivered: true, messageId: info.messageId };
    } catch (mailError) {
      console.warn(`\n⚠️ [Nodemailer Send Error]: ${mailError.message}\n`);
      return { success: false, delivered: false, error: mailError.message };
    }
  } else {
    console.log(`ℹ️ [Email Notice]: SMTP credentials not found. Check .env configuration.`);
    return { success: false, delivered: false, simulated: true };
  }
}

export default {
  sendOtpEmail,
};
