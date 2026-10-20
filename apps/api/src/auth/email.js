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

export function createVerificationSender(settings, request = fetch) {
  return async ({ email, token, tokenHash }) => {
    try {
      const response = await request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `email-verify-${tokenHash}`,
        },
        body: JSON.stringify(
          verificationEmail({
            to: email,
            token,
            webOrigin: settings.webOrigin,
            ttlHours: settings.verificationTtlHours,
            from: settings.emailFrom,
          }),
        ),
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error('Email delivery failed.');
    } catch {
      // Provider responses can contain addresses; never log or return them.
      throw new ApiError(
        503,
        'EMAIL_UNAVAILABLE',
        'We could not send the verification email. Please try sending another link.',
      );
    }
  };
}
