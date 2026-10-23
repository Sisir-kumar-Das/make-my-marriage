import nodemailer from 'nodemailer';
import { ApiError } from '../lib/api-error.js';

export function emailConfigured(settings) {
  if ((settings.emailProvider ?? 'resend') === 'resend')
    return Boolean(settings.resendApiKey && settings.emailFrom);
  if (settings.emailProvider === 'gmail')
    return (
      /^[a-z0-9][a-z0-9.+_-]*@(gmail|googlemail)\.com$/i.test(
        settings.smtpUser || '',
      ) && /^[a-z0-9]{16}$/i.test(settings.smtpAppPassword || '')
    );
  return false;
}

function senderAddress(settings) {
  return settings.emailProvider === 'gmail'
    ? { name: 'Make My Marriage', address: settings.smtpUser }
    : settings.emailFrom;
}

export function verificationEmail({ to, token, webOrigin, ttlHours, from }) {
  const url = new URL('/verify-email', webOrigin);
  // Fragments are not sent to web servers or in HTTP referrers.
  url.hash = new URLSearchParams({ token }).toString();
  return {
    from,
    to: [to],
    subject: 'Verify your email — Make My Marriage',
    text: `Welcome to Make My Marriage.\n\nVerify your email using this link:\n${url.href}\n\nOpen the link, then choose Verify email. It expires in ${ttlHours} hours and can be used once. If you did not create an account, you can ignore this email.`,
  };
}

export function resetEmail({ to, token, webOrigin, ttlMinutes, from }) {
  const url = new URL('/reset-password', webOrigin);
  url.hash = new URLSearchParams({ token }).toString();
  return {
    from,
    to: [to],
    subject: 'Reset your password — Make My Marriage',
    text: `Reset your Make My Marriage password using this link:\n${url.href}\n\nChoose and confirm your new password on the page. This link expires in ${ttlMinutes} minutes and can be used once. Requesting a newer link replaces this one. If you did not request this, ignore this email; your password has not changed.`,
  };
}

export function passwordChangedEmail({ to, from }) {
  return {
    from,
    to: [to],
    subject: 'Your password was changed — Make My Marriage',
    text: 'Your Make My Marriage password was changed successfully. All existing sessions for your account have been signed out. Sign in with your new password. If you did not make this change, use Forgot password on the sign-in page to secure your account.',
  };
}

function createSender(
  settings,
  compose,
  prefix,
  message,
  { request = fetch, createTransport = nodemailer.createTransport } = {},
) {
  let transport;
  return async (input) => {
    try {
      if (!emailConfigured(settings)) throw new Error('Email not configured.');
      if (settings.emailProvider === 'gmail') {
        transport ??= createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user: settings.smtpUser, pass: settings.smtpAppPassword },
          pool: false,
          dnsTimeout: 3000,
          connectionTimeout: 4000,
          greetingTimeout: 3000,
          socketTimeout: 8000,
          tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
          logger: false,
          debug: false,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        const result = await transport.sendMail(compose(input));
        if (result.accepted?.length !== 1 || result.rejected?.length)
          throw new Error('Email recipient not accepted.');
        return;
      }
      const response = await request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${prefix}-${input.tokenHash}`,
        },
        body: JSON.stringify(compose(input)),
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error('Email delivery failed.');
    } catch {
      // Provider responses can contain addresses; never log or return them.
      throw new ApiError(503, 'EMAIL_UNAVAILABLE', message);
    }
  };
}

export function createVerificationSender(settings, dependencies) {
  return createSender(
    settings,
    ({ email, token }) =>
      verificationEmail({
        to: email,
        token,
        webOrigin: settings.webOrigin,
        ttlHours: settings.verificationTtlHours,
        from: senderAddress(settings),
      }),
    'email-verify',
    'We could not send the verification email. Please try sending another link.',
    dependencies,
  );
}

export function createResetSender(settings, dependencies) {
  return createSender(
    settings,
    ({ email, token }) =>
      resetEmail({
        to: email,
        token,
        webOrigin: settings.webOrigin,
        ttlMinutes: settings.resetTtlMinutes,
        from: senderAddress(settings),
      }),
    'password-reset',
    'We could not send the reset email. Please request another link.',
    dependencies,
  );
}

export function createPasswordChangedSender(settings, dependencies) {
  return createSender(
    settings,
    ({ email }) =>
      passwordChangedEmail({ to: email, from: senderAddress(settings) }),
    'password-changed',
    'We could not send the password change notification.',
    dependencies,
  );
}
