export const SESSION_CHECK_DEADLINE = 20000;
export const WORKSPACE_OPEN_DEADLINE = 10000;

// Own one root-entry attempt, including the wait after authentication succeeds.
export function createHomeEntryFlow({
  checkSession,
  navigate,
  stopNavigation,
  onState,
}) {
  let active = true;
  let sequence = 0;
  let controller;
  let timer;
  let state = { phase: 'checking' };
  const current = (id) => active && sequence === id;
  function publish(next) {
    if (!active) return;
    state = next;
    onState(next);
  }
  function invalidate() {
    sequence++;
    controller?.abort();
    controller = undefined;
    clearTimeout(timer);
    timer = undefined;
  }
  function stopOpening() {
    try {
      stopNavigation();
    } catch {
      // Revalidation remains available if the browser cannot stop loading.
    }
  }
  function start() {
    if (!active) return;
    if (state.phase === 'opening') {
      // A retry must not leave the earlier document navigation in flight.
      stopOpening();
    }
    invalidate();
    const id = sequence;
    controller = new AbortController();
    const signal = controller.signal;
    if (state.phase !== 'checking') publish({ phase: 'checking' });
    timer = setTimeout(() => {
      if (!current(id)) return;
      invalidate();
      publish({
        phase: 'failed',
        message:
          'Checking your sign-in is taking longer than expected. Please retry.',
      });
    }, SESSION_CHECK_DEADLINE);
    void (async () => {
      let result;
      try {
        result = await checkSession(signal);
      } catch (error) {
        if (!current(id)) return;
        clearTimeout(timer);
        timer = undefined;
        publish(
          error?.code === 'SESSION_EXPIRED'
            ? { phase: 'guest' }
            : {
                phase: 'failed',
                message:
                  error?.message ||
                  'We could not check your session. Please retry.',
              },
        );
        return;
      }
      if (!current(id)) return;
      clearTimeout(timer);
      if (!result?.data?.user?.id) {
        timer = undefined;
        publish({
          phase: 'failed',
          message: 'We could not confirm your session. Please retry.',
        });
        return;
      }
      // No URL from the API or query string can become a navigation target.
      const destination = result.data.wedding ? '/dashboard' : '/wedding-setup';
      publish({ phase: 'opening', destination });
      timer = setTimeout(() => {
        if (!current(id)) return;
        // Stop the pending document load so the current page stays interactive.
        stopOpening();
        publish({ phase: 'stalled', destination });
      }, WORKSPACE_OPEN_DEADLINE);
      try {
        navigate(destination);
      } catch {
        if (!current(id)) return;
        clearTimeout(timer);
        timer = undefined;
        publish({
          phase: 'stalled',
          destination,
          message: 'We could not open your workspace. Retry or continue below.',
        });
      }
    })();
  }
  return {
    start,
    dispose() {
      active = false;
      invalidate();
    },
  };
}
