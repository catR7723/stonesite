// utils/mailer.js (SendGrid via SMTP - nodemailer)
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',                 // deve essere esattamente 'apikey'
    pass: process.env.SENDGRID_API_KEY
  }
});

transporter.verify((err) => {
  if (err) console.error('Mailer verify failed:', err);
  else console.log('Mailer ready (SendGrid SMTP)');
});

async function sendMail(to, subject, text, html) {
  const from = process.env.MAIL_FROM || process.env.EMAIL_USER || 'no-reply@example.com';
  const mail = { from, to, subject, text, html };
  try {
    const info = await transporter.sendMail(mail);
    console.log('Mail sent:', info && info.messageId);
    return info;
  } catch (err) {
    console.error('Mail send error:', err);
    throw err;
  }
}

module.exports = { sendMail };