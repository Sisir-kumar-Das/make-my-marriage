const id = /^[a-f\d]{24}$/;
export const taskNavigationKeys = ['create', 'task', 'fromEvent'];

// These are UI intents, never API filters or user-supplied redirect URLs.
export function readTaskNavigation(params) {
  const create = params.get('create');
  const taskId = params.get('task');
  const fromEvent = params.get('fromEvent');
  const invalid =
    taskNavigationKeys.some((key) => params.getAll(key).length > 1) ||
    (create !== null && create !== '1') ||
    (taskId !== null && !id.test(taskId)) ||
    (fromEvent !== null && !id.test(fromEvent)) ||
    (!!create && !!taskId);
  return {
    create: !invalid && create === '1',
    taskId: !invalid ? taskId : null,
    fromEvent: !invalid ? fromEvent : null,
    error: invalid
      ? 'This task shortcut is invalid. Open Tasks again to continue.'
      : '',
  };
}

export function ceremonyTasksUrl(eventId, { create = false, taskId } = {}) {
  if (!id.test(eventId)) throw new Error('A saved ceremony is required.');
  if (taskId && !id.test(taskId)) throw new Error('A saved task is required.');
  const params = new URLSearchParams({ eventId, fromEvent: eventId });
  if (create) params.set('create', '1');
  else if (taskId) params.set('task', taskId);
  return '/tasks?' + params;
}

export function ceremonyReturnUrl(eventId) {
  if (!id.test(eventId)) throw new Error('A saved ceremony is required.');
  return '/events?event=' + eventId;
}

export function consumeTaskIntent(href) {
  const url = new URL(href);
  url.searchParams.delete('create');
  url.searchParams.delete('task');
  return url.pathname + url.search + url.hash;
}

export function taskPageCorrectionUrl(href, page) {
  const url = new URL(href);
  // Correct only pagination on the current URL. A shortcut may still be pending,
  // or may already have opened and consumed its intent while the list loaded.
  if (page === 1) url.searchParams.delete('page');
  else url.searchParams.set('page', String(page));
  return url.pathname + url.search + url.hash;
}
