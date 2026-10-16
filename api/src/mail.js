import nodemailer from 'nodemailer';
import { config } from './config.js';

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

export const sentInDev = []; // inspected by tests

export async function sendMail(to, subject, text) {
  const t = getTransport();
  if (!t) {
    // No SMTP configured: print to the server log so you can still test sign-up locally.
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
    sentInDev.push({ to, subject, text });
    if (sentInDev.length > 50) sentInDev.shift();
    return;
  }
  await t.sendMail({ from: config.smtp.from, to, subject, text });
}

// SMS: POST {to, message} as JSON to SMS_WEBHOOK_URL (works with MSG91/Twilio/Make/n8n flows). Logged when unset.
export async function sendSms(to, message) {
  const url = process.env.SMS_WEBHOOK_URL;
  if (!url) {
    console.log(`[sms:dev] to=${to} message="${message}"`);
    sentInDev.push({ to, subject: 'sms', text: message });
    return;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.SMS_WEBHOOK_AUTH ? { Authorization: process.env.SMS_WEBHOOK_AUTH } : {}) },
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) throw new Error(`SMS webhook failed: ${res.status}`);
}
