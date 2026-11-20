// Request sequencing stays in the component. These transitions own which
// feedback/actions survive background checks, explicit recovery and navigation.
export function initialLifecycleState(initial) {
  return {
    lifecycle: initial ?? null,
    error: '',
    readError: null,
    feedback: '',
    open: false,
    confirmation: '',
    operation: null,
    pending: false,
    checking: false,
    loading: !initial,
    denied: false,
    navigating: false,
  };
}

export function lifecycleReducer(state, event) {
  switch (event.type) {
    case 'OPEN':
      return state.pending ||
        state.loading ||
        state.denied ||
        state.operation ||
        state.navigating
        ? state
        : { ...state, open: true, confirmation: '', feedback: '' };
    case 'CLOSE':
      return state.pending || state.operation || state.navigating
        ? state
        : { ...state, open: false };
    case 'INPUT':
      return state.pending || state.operation
        ? state
        : { ...state, confirmation: event.value };
    case 'READ_START':
      return event.explicit ? { ...state, loading: true, feedback: '' } : state;
    case 'READ_OK':
      if (event.explicit)
        return {
          ...state,
          lifecycle: event.lifecycle,
          denied: false,
          readError: null,
          error: state.operation ? state.error : '',
          feedback: state.operation ? '' : 'Current recovery state loaded.',
        };
      return {
        ...state,
        lifecycle: event.lifecycle,
        // Background success cannot acknowledge a definitive error for a user.
        readError:
          state.denied || state.readError?.latched ? state.readError : null,
      };
    case 'READ_FAIL': {
      const readError = {
        message: event.message,
        accessDenied: event.accessDenied,
        latched: event.explicit || event.accessDenied,
      };
      if (event.accessDenied)
        return {
          ...state,
          lifecycle: null,
          checking: false,
          pending: false,
          error: '',
          readError,
          feedback: '',
          denied: true,
          open: false,
          confirmation: '',
          operation: null,
        };
      // A later transient read cannot replace a latched access denial.
      return {
        ...state,
        readError: state.readError?.accessDenied ? state.readError : readError,
        feedback: '',
      };
    }
    case 'READ_END':
      return { ...state, loading: false };
    case 'RESULT_START':
      return {
        ...state,
        pending: true,
        checking: true,
        error: '',
        readError: null,
        feedback: '',
      };
    case 'SAVE_START':
      return {
        ...state,
        operation: event.operation,
        checking: false,
        pending: true,
        error: '',
        readError: null,
        feedback: '',
      };
    case 'SAVE_FAIL':
      return {
        ...state,
        checking: false,
        pending: false,
        error: event.message,
        readError: null,
        feedback: '',
        operation:
          event.definitive || event.clearOperation ? null : state.operation,
        ...(event.definitive
          ? { denied: true, open: false, confirmation: '' }
          : {}),
      };
    case 'SAVE_END':
      return state.navigating
        ? state
        : { ...state, pending: false, checking: false };
    case 'NAVIGATE':
      return {
        ...state,
        navigating: true,
        checking: false,
        pending: true,
        operation: null,
        error: '',
        readError: null,
        feedback: '',
      };
    case 'NAVIGATION_FAILED':
      return {
        ...state,
        navigating: false,
        pending: false,
        denied: true,
        operation: null,
        open: false,
        error: 'Navigation could not finish. Reload current state to continue.',
      };
    case 'DISCARD_SCOPE':
      return { ...initialLifecycleState(null), loading: false, denied: true };
    default:
      return state;
  }
}
