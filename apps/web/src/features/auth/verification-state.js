export function verificationState(hash, attempt) {
  const token = new URLSearchParams(hash.slice(1)).get('token') || '';
  const current = attempt?.hash === hash;
  return {
    token,
    validToken: /^[A-Za-z0-9_-]{43}$/.test(token),
    state: current ? attempt.state : 'idle',
    error: current ? attempt.error : '',
  };
}

export function cancelVerificationAttempt(attempt, operation) {
  return attempt?.state === 'pending' && attempt.operation === operation
    ? null
    : attempt;
}

export async function runVerificationAttempt({
  operation,
  request,
  setAttempt,
  readHash,
  send,
  onVerified,
}) {
  const current = () =>
    request.current === operation &&
    !operation.controller.signal.aborted &&
    readHash() === operation.hash;
  try {
    await send();
    if (!current()) return;
    onVerified();
    setAttempt({ hash: '', state: 'verified', error: '' });
  } catch (failure) {
    if (!current()) return;
    setAttempt({
      hash: operation.hash,
      error: failure.message,
      state: failure.code === 'INVALID_VERIFICATION_LINK' ? 'invalid' : 'idle',
    });
  } finally {
    // A stale response can settle before the link-change cleanup runs.
    setAttempt((previous) => cancelVerificationAttempt(previous, operation));
    if (request.current === operation) request.current = null;
  }
}
