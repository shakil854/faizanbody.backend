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
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
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
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
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
  const subject = type === 'login'
    ? 'Faizan Body Account - Login Verification Code'
    : type === 'forgot_password'
    ? 'Faizan Body Account - Password Reset Verification Code'
    : 'Faizan Body Account - Security Verification Code';

  const actionText = type === 'login' ? 'login to' : 'verify';

  const plainText = [
    `Hello ${userName},`,
    '',
    `Your login verification code for Faizan Body is: ${otp}`,
    '',
    'This code is valid for 10 minutes. Please enter this code in the application to complete your sign in.',
    '',
    'If you did not make this login request, please change your password immediately or contact your administrator.',
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
            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #111827;">${type === 'login' ? 'Login Verification Code' : 'Verification Code'}</h2>
            <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.5; color: #4b5563;">
              Hello ${userName},<br><br>
              ${type === 'login' 
                ? 'We received a sign-in attempt for your <strong>Faizan Body</strong> account. Enter the 6-digit OTP code below to verify your identity and finish logging in:' 
                : 'We received a request to verify your <strong>Faizan Body</strong> account. Use the code below to complete your verification:'}
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

  // 0. Google Apps Script Web App (Sends directly from Gmail account via HTTPS 443 - zero SMTP port blocks on Render!)
  const gmailScriptUrl = process.env.GMAIL_SCRIPT_URL;
  if (gmailScriptUrl) {
    try {
      const gRes = await fetch(gmailScriptUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          to: toEmail,
          userName,
          subject,
          text: plainText,
          html: htmlContent,
        }),
      });
      if (gRes.ok) {
        console.log(`\n✅ [Gmail Webhook LIVE] OTP Email sent directly via Gmail to ${toEmail}\n`);
        return { success: true, delivered: true, provider: 'gmail_webapp' };
      }
    } catch (gErr) {
      console.warn(`⚠️ [Gmail Webhook Error]: ${gErr.message}`);
    }
  }

  // 1. Try Brevo HTTPS API (Works 100% on Render / Cloud where SMTP is blocked)
  if (process.env.BREVO_API_KEY) {
    try {
      const brevoSender = process.env.BREVO_SENDER || process.env.SMTP_USER || 'syncrobytetech@gmail.com';
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Faizan Body Build', email: brevoSender },
          to: [{ email: toEmail, name: userName }],
          subject,
          htmlContent,
          textContent: plainText,
        }),
      });

      if (brevoRes.ok) {
        const bData = await brevoRes.json();
        console.log(`\n✅ [Brevo HTTPS LIVE] OTP Email sent successfully to ${toEmail} (ID: ${bData.messageId})\n`);
        return { success: true, delivered: true, messageId: bData.messageId };
      } else {
        const errText = await brevoRes.text();
        console.warn(`⚠️ [Brevo API Error]: ${errText}`);
      }
    } catch (bErr) {
      console.warn(`⚠️ [Brevo Request Error]: ${bErr.message}`);
    }
  }

  // 2. Try Resend HTTPS API (Works 100% on Render / Cloud where SMTP is blocked)
  if (process.env.RESEND_API_KEY) {
    try {
      const resendSender = process.env.RESEND_SENDER || 'onboarding@resend.dev';
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Faizan Body <${resendSender}>`,
          to: [toEmail],
          subject,
          html: htmlContent,
          text: plainText,
        }),
      });

      if (resendRes.ok) {
        const rData = await resendRes.json();
        console.log(`\n✅ [Resend HTTPS LIVE] OTP Email sent successfully to ${toEmail} (ID: ${rData.id})\n`);
        return { success: true, delivered: true, messageId: rData.id };
      } else {
        const errText = await resendRes.text();
        console.warn(`⚠️ [Resend API Error]: ${errText}`);
      }
    } catch (rErr) {
      console.warn(`⚠️ [Resend Request Error]: ${rErr.message}`);
    }
  }

  // 3. Fallback to Nodemailer SMTP (Fast timeout protected against hung connections)
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

/**
 * Send Automated Database Backup to Google Account Email
 */
export async function sendBackupEmail({ toEmail, filename, content, dateStr }) {
  const subject = `Faizan Body - Automated Daily Database Backup (${dateStr})`;
  const senderUser = process.env.SMTP_USER || config.email.user;
  const fromHeader = `Faizan Body <${senderUser}>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="gu">
    <head><meta charset="utf-8"></head>
    <body style="font-family: sans-serif; background-color: #f8fafc; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: #1e3a8a; padding: 20px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px;">🛡️ Faizan Body - દૈનિક ડેટાબેઝ બેકઅપ</h2>
        </div>
        <div style="padding: 24px; color: #334155; font-size: 15px; line-height: 1.6;">
          <p>નમસ્તે,</p>
          <p>તમારા Faizan Body એકાઉન્ટ માટે આજનો સંપૂર્ણ ડેટાબેઝ બેકઅપ સફળતાપૂર્વક લેવાયો છે અને આ ઈમેલ સાથે એટેચ કરેલ છે:</p>
          <div style="background: #f1f5f9; padding: 14px; border-radius: 8px; margin: 16px 0;">
            📁 <strong>ફાઈલનું નામ:</strong> ${filename}<br>
            📅 <strong>તારીખ:</strong> ${dateStr}<br>
            💾 <strong>પ્રકાર:</strong> Single Complete JSON (.json)<br>
            🛡️ <strong>ટેબલ્સ:</strong> All 12 Database Tables Included
          </div>
          <p style="font-size: 13px; color: #64748b;">
            આ ફાઈલ તમારા Google Drive માં સીધી સેવ કરવા માટે ઈમેલ એટેચમેન્ટ પર "Save to Drive" આઇકન દબાવો.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. Try Brevo HTTPS with attachment if configured
  if (process.env.BREVO_API_KEY) {
    try {
      const base64Content = Buffer.from(content).toString('base64');
      const bRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Faizan Body Build', email: process.env.BREVO_SENDER || senderUser },
          to: [{ email: toEmail }],
          subject,
          htmlContent,
          attachment: [
            {
              name: filename,
              content: base64Content,
            },
          ],
        }),
      });
      if (bRes.ok) {
        return { success: true, delivered: true };
      }
    } catch (e) {
      console.warn('Brevo backup send warning:', e.message);
    }
  }

  // 2. Nodemailer SMTP with attachment
  const activeTransporter = getTransporter();
  if (activeTransporter) {
    try {
      await activeTransporter.sendMail({
        from: fromHeader,
        to: toEmail,
        subject,
        html: htmlContent,
        attachments: [
          {
            filename,
            content,
            contentType: 'application/json',
          },
        ],
      });
      console.log(`✅ [Backup Email] Delivered daily backup to ${toEmail}`);
      return { success: true, delivered: true };
    } catch (err) {
      console.warn('Nodemailer backup send warning:', err.message);
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: 'No email transport configured' };
}

export default {
  sendOtpEmail,
  sendBackupEmail,
};
