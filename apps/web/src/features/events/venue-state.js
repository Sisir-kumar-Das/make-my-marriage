// A new prediction can carry a fresh session even when its place ID is unchanged.
export function sameVenueSelection(a, b) {
  return !!a && !!b && a.placeId === b.placeId && a.prediction === b.prediction;
}
export function venueDetailAttempt(retry, selection) {
  return sameVenueSelection(retry?.selection, selection) ? retry.attempt : 0;
}
export function currentVenueSearch(result, key, sessionToken) {
  if (result?.key !== key) return null;
  if (result.error) return result;
  return result.sessionToken && result.sessionToken === sessionToken
    ? result
    : null;
}
export function nextSuggestionIndex(index, count, direction) {
  if (!count) return -1;
  if (index < 0 || index >= count)
    return direction === 'ArrowUp' ? count - 1 : 0;
  return (index + (direction === 'ArrowUp' ? -1 : 1) + count) % count;
}
