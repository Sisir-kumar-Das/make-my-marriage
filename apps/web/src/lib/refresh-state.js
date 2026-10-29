// A background refresh may retain only the same account, permissions and query.
export function refreshState(result, scope, key) {
  const current = result?.scope === scope ? result : null;
  const data = current?.data ?? null;
  const error = current?.key === key ? current.error || '' : '';
  return {
    data,
    error,
    loading: !data && !error,
    refreshing: !!data && current.key !== key,
  };
}
