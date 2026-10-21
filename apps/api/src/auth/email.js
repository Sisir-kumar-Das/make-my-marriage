import { ApiError } from '../lib/api-error.js';

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

function createSender(settings, compose, prefix, message, request) {
  return async (input) => {
    try {
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

export function createVerificationSender(settings, request = fetch) {
  return createSender(
    settings,
    ({ email, token }) =>
      verificationEmail({
        to: email,
        token,
        webOrigin: settings.webOrigin,
        ttlHours: settings.verificationTtlHours,
        from: settings.emailFrom,
      }),
    'email-verify',
    'We could not send the verification email. Please try sending another link.',
    request,
  );
}

export function createResetSender(settings, request = fetch) {
  return createSender(
    settings,
    ({ email, token }) =>
      resetEmail({
        to: email,
        token,
        webOrigin: settings.webOrigin,
        ttlMinutes: settings.resetTtlMinutes,
        from: settings.emailFrom,
      }),
    'password-reset',
    'We could not send the reset email. Please request another link.',
    request,
  );
}

export function createPasswordChangedSender(settings, request = fetch) {
  return createSender(
    settings,
    ({ email }) =>
      passwordChangedEmail({ to: email, from: settings.emailFrom }),
    'password-changed',
    'We could not send the password change notification.',
    request,
  );
}
