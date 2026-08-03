// utils/mailer.js
// Env-aware mailer: in production uses Mailgun API if available; otherwise falls back to SMTP. In non-production or when MAIL_ENABLED=false it logs emails.
require('dotenv').config();
const nodemailer = require('nodemailer');
const formData = require('form-data');
const Mailgun = require('mailgun.js');

const isProd = process.env.NODE_ENV === 'production';
const mailEnabled = process.env.MAIL_ENABLED !== 'false'; // default true

let transporter = null;
let mgClient = null;
let useMailgunApi = false;

function formatFrom() {
  const raw = process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.EMAIL_USER || '';
  if (!raw) return 'no-reply@example.com';

  // If already in the form "Name <email@domain>", return as-is
  if (raw.includes('<') && raw.includes('>')) return raw.replace(/\"/g, '');

  // Try to extract an email address
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    const email = emailMatch[0];
    // name is everything else without the email
    const name = raw.replace(email, '').replace(/[\"<>]/g, '').trim();
    const displayName = name || 'No Reply';
    return `${displayName} <${email}>`;
  }

  // If raw looks like a simple email
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) return `No Reply <${raw}>`;

  return 'no-reply@example.com';
}

// Prefer Mailgun API on production when MAILGUN_API_KEY and MAILGUN_DOMAIN are set
if (isProd && mailEnabled && process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
  try {
    const mailgun = new Mailgun(formData);
    mgClient = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY,
      url: process.env.MAILGUN_URL || 'https://api.mailgun.net' // defaults to US region
    });
    useMailgunApi = true;
    console.log('Mailer: using Mailgun API');
  } catch (e) {
    console.warn('Mailgun API client not available, falling back to SMTP:', e.message);
  }
} else {
  if (isProd && mailEnabled) {
    console.log(`[Mailer] isProd=${isProd}, mailEnabled=${mailEnabled}, SENDGRID_API_KEY=${process.env.SENDGRID_API_KEY ? 'present' : 'MISSING'}`);
  }
}

if (!useMailgunApi && isProd && mailEnabled) {
  // Use SMTP transport (configurable via env) as fallback
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailgun.org',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_SECURE) === 1 || process.env.SMTP_SECURE === 'true' || false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  transporter.verify((err) => {
    if (err) console.error('Mailer verify failed:', err);
    else console.log('Mailer ready (SMTP)');
  });
} else if (!isProd || !mailEnabled) {
  // Development: use a JSON transport so nodemailer won't open network sockets
  transporter = nodemailer.createTransport({ jsonTransport: true });
  console.log('Mailer in DEV mode: emails will be logged, not sent. Set NODE_ENV=production and MAIL_ENABLED=true to enable real sending.');
}

async function sendMail(to, subject, text, html) {
  const from = formatFrom();
  
  if (!mailEnabled) {
    console.log('[MAIL DISABLED] to=%s subject=%s text=%s', to, subject, text);
    return { messageId: `disabled-${Date.now()}` };
  }

  try {
    if (useMailgunApi && mgClient) {
      // Mailgun API payload
      const messageData = {
        from: from,
        to: [to],
        subject: subject,
        text: text,
        html: html
      };

      const res = await mgClient.messages.create(process.env.MAILGUN_DOMAIN, messageData);
      console.log('Mail sent via Mailgun API:', res.status || res.message);
      return res;
    }

    // Fallback to nodemailer transporter
    console.log(`[Mailer] Sending via nodemailer SMTP to ${to}, from ${from}`);
    const info = await transporter.sendMail({ from, to, subject, text, html });
    console.log('Mail send result (SMTP/jsonTransport):', info && (info.messageId || info));
    return info;
  } catch (err) {
    console.error('Mail send error:', err);
    throw err;
  }
}

module.exports = { sendMail };