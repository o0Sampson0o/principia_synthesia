type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[email] Would send to ${to}: ${subject}`);
    console.log(`[email] HTML preview: ${html.slice(0, 200)}…`);
    return;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transport.sendMail({ from: smtpFrom, to, subject, html });
}

export function buildInvitationEmailHtml(opts: {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}): string {
  const { orgName, inviterName, role, acceptUrl } = opts;
  const safeOrg = escapeHtml(orgName);
  const safeInviter = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  const safeAcceptUrl = escapeHtml(acceptUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
  <h1 style="font-size: 1.5rem;">You're invited to join ${safeOrg}</h1>
  <p>${safeInviter} has invited you to join <strong>${safeOrg}</strong> as a <strong>${safeRole}</strong>.</p>
  <p><a href="${safeAcceptUrl}" style="background: #1a1a1a; color: #fff; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 6px; display: inline-block;">Accept invitation</a></p>
  <p style="color: #666; font-size: 0.875rem;">This invitation expires in 7 days. If you did not expect this invitation, you can ignore this email.</p>
</body>
</html>`;
}

export function buildVerificationEmailHtml(verificationUrl: string): string {
  const safeUrl = escapeHtml(verificationUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
  <h1 style="font-size: 1.5rem;">Verify your email address</h1>
  <p>Click the link below to verify your email address and activate your account:</p>
  <p><a href="${safeUrl}" style="background: #1a1a1a; color: #fff; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 6px; display: inline-block;">Verify email</a></p>
  <p style="color: #666; font-size: 0.875rem;">This link expires in 24 hours. If you did not sign up, you can ignore this email.</p>
</body>
</html>`;
}
