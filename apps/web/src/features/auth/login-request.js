// Keep request completion tied to the invitation/page where sign-in began.
export function cancelLoginRequest(request) {
  const operation = request.current;
  request.current = null;
  operation?.controller.abort();
}

export async function runLoginRequest({
  request,
  context,
  readContext,
  send,
  onSuccess,
  onFailure,
}) {
  cancelLoginRequest(request);
  const operation = { context, controller: new AbortController() };
  request.current = operation;
  const current = () =>
    request.current === operation &&
    !operation.controller.signal.aborted &&
    readContext() === context;
  try {
    const result = await send(operation.controller.signal);
    if (current()) onSuccess(result);
  } catch (failure) {
    if (current()) onFailure(failure);
  } finally {
    if (request.current === operation) request.current = null;
  }
}
