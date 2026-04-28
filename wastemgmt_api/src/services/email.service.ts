import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { AlertDoc } from '../models/Alert.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!config.SMTP_HOST || !config.SMTP_USER) {
    logger.warn('SMTP not configured — emails disabled');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  return transporter;
}

const FOOTER =
  '<p style="color:#888;font-size:12px;margin-top:24px">Smart Waste Management Platform · Coral Telecom</p>';

function uniqueRecipients(extra: Array<string | undefined | null> = []): string[] {
  const all = [config.ALERT_EMAIL_TO, ...extra]
    .map((e) => (e ?? '').trim().toLowerCase())
    .filter((e) => e.length > 0 && /.+@.+\..+/.test(e));
  return Array.from(new Set(all));
}

export class EmailService {
  /** Sends an alert email to the global admin recipient + any extra recipients. */
  static async sendAlert(alert: AlertDoc, extraRecipients: string[] = []): Promise<void> {
    const t = getTransporter();
    const recipients = uniqueRecipients(extraRecipients);
    if (!t || recipients.length === 0) return;

    const subject = `[${alert.severity?.toUpperCase()}] ${alert.type} — ${alert.dustbinId}`;
    const html = `
      <h2 style="margin:0 0 12px 0">${alert.type}</h2>
      <p><strong>Dustbin:</strong> ${alert.dustbinId}</p>
      <p><strong>Severity:</strong> ${alert.severity}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      ${alert.metric ? `<p><strong>${alert.metric}</strong>: ${alert.value} (threshold ${alert.threshold ?? '—'})</p>` : ''}
      ${FOOTER}
    `;
    try {
      await t.sendMail({ from: config.SMTP_FROM, to: recipients.join(','), subject, html });
    } catch (err) {
      logger.error({ err, alertId: alert.id }, 'sendAlert failed');
    }
  }

  /** Sent when an admin creates a new user account. */
  static async sendWelcome(input: {
    to: string;
    username: string;
    password: string;
    role: 'admin' | 'user';
    loginUrl?: string;
  }): Promise<void> {
    const t = getTransporter();
    const to = (input.to ?? '').trim();
    if (!t || !to) return;
    const url = input.loginUrl ?? '';
    const html = `
      <h2 style="margin:0 0 12px 0">Welcome to Smart Waste Management</h2>
      <p>An account has been created for you.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0"><strong>Username</strong></td><td>${input.username}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Temporary password</strong></td><td><code>${input.password}</code></td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Role</strong></td><td>${input.role}</td></tr>
      </table>
      ${url ? `<p style="margin-top:16px"><a href="${url}">Sign in</a></p>` : ''}
      <p style="color:#b00;font-size:13px;margin-top:16px">For security, please change your password after first login.</p>
      ${FOOTER}
    `;
    try {
      await t.sendMail({
        from: config.SMTP_FROM,
        to,
        subject: 'Your Smart Waste Management account',
        html,
      });
    } catch (err) {
      logger.error({ err, to }, 'sendWelcome failed');
    }
  }

  /** Sent when a user (or admin) changes their email or password. */
  static async sendAccountChanged(input: {
    to: string;
    username: string;
    change: 'email' | 'password';
    ip?: string;
  }): Promise<void> {
    const t = getTransporter();
    const to = (input.to ?? '').trim();
    if (!t || !to) return;
    const subject =
      input.change === 'password'
        ? 'Your password was changed'
        : 'Your account email was updated';
    const html = `
      <h2 style="margin:0 0 12px 0">${subject}</h2>
      <p>Hi ${input.username},</p>
      <p>Your account ${input.change} was just updated${input.ip ? ` from IP <code>${input.ip}</code>` : ''}.</p>
      <p>If this wasn't you, please contact your administrator immediately.</p>
      ${FOOTER}
    `;
    try {
      await t.sendMail({ from: config.SMTP_FROM, to, subject, html });
    } catch (err) {
      logger.error({ err, to }, 'sendAccountChanged failed');
    }
  }
}
