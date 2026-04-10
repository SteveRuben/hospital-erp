import nodemailer from 'nodemailer';
import { query } from '../config/db.js';

// SMS provider interface — plug any provider (Twilio, Africa's Talking, etc.)
interface SmsResult { success: boolean; messageId?: string; error?: string }

const sendSms = async (to: string, message: string): Promise<SmsResult> => {
  const provider = process.env.SMS_PROVIDER || 'log';
  const apiKey = process.env.SMS_API_KEY;
  const apiUrl = process.env.SMS_API_URL;
  const senderId = process.env.SMS_SENDER_ID || 'HospitalERP';

  if (provider === 'log' || !apiKey) {
    console.log(`[SMS] To: ${to} | Message: ${message}`);
    return { success: true, messageId: 'log-' + Date.now() };
  }

  try {
    // Generic HTTP SMS API (works with Africa's Talking, Twilio, etc.)
    const response = await fetch(apiUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ to, message, from: senderId }),
    });
    
    if (!response.ok) throw new Error(`SMS API error: ${response.status}`);
    const data = await response.json() as { messageId?: string };
    return { success: true, messageId: data.messageId };
  } catch (err) {
    console.error('[SMS] Failed:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
};

// Email transporter
const getMailTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendEmail = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> => {
  if (!process.env.SMTP_USER) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    return { success: true };
  }

  try {
    const transporter = getMailTransporter();
    await transporter.sendMail({
      from: `"Hospital ERP" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (err) {
    console.error('[EMAIL] Failed:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
};

// Main notification function: SMS first, email fallback
export const sendNotification = async (
  patientId: number,
  subject: string,
  message: string,
  htmlMessage?: string
): Promise<{ channel: string; success: boolean; error?: string }> => {
  // Get patient contact info
  const result = await query('SELECT telephone, email, nom, prenom FROM patients WHERE id = $1', [patientId]);
  if (result.rows.length === 0) return { channel: 'none', success: false, error: 'Patient non trouvé' };

  const patient = result.rows[0];
  const fullMessage = `${patient.prenom} ${patient.nom}, ${message}`;

  // Try SMS first
  if (patient.telephone) {
    const smsResult = await sendSms(patient.telephone, fullMessage);
    if (smsResult.success) {
      await logNotification(patientId, 'sms', subject, message, true);
      return { channel: 'sms', success: true };
    }
  }

  // Fallback to email
  if (patient.email) {
    const html = htmlMessage || `<p>Bonjour ${patient.prenom} ${patient.nom},</p><p>${message}</p><p>— Hospital ERP</p>`;
    const emailResult = await sendEmail(patient.email, subject, html);
    if (emailResult.success) {
      await logNotification(patientId, 'email', subject, message, true);
      return { channel: 'email', success: true };
    }
    return { channel: 'email', success: false, error: emailResult.error };
  }

  await logNotification(patientId, 'none', subject, message, false);
  return { channel: 'none', success: false, error: 'Aucun contact disponible (ni téléphone ni email)' };
};

const logNotification = async (patientId: number, channel: string, subject: string, message: string, success: boolean) => {
  try {
    await query(
      'INSERT INTO notifications_log (patient_id, channel, subject, message, success) VALUES ($1,$2,$3,$4,$5)',
      [patientId, channel, subject, message, success]
    );
  } catch (err) {
    console.error('[NOTIFICATION LOG] Failed:', err);
  }
};

export default { sendNotification, sendSms, sendEmail };