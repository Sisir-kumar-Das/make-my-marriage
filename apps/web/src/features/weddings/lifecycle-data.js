// The server owns availability. A monotonic elapsed timer only animates its
// latest countdown sample; the device's calendar clock never grants/denies access.
export function lifecycleView(lifecycle, elapsedMs = 0) {
  const serverNow = Date.parse(lifecycle?.serverNow);
  const deadline = Date.parse(lifecycle?.purgeAfter);
  return {
    active: lifecycle?.state === 'ACTIVE',
    canRestore:
      lifecycle?.state === 'RECOVERABLE' && lifecycle.canRestore === true,
    expired: ['EXPIRED', 'PURGING'].includes(lifecycle?.state),
    remaining:
      Number.isFinite(serverNow) && Number.isFinite(deadline)
        ? Math.max(0, deadline - serverNow - Math.max(0, elapsedMs))
        : null,
  };
}
