// Only IDs leave this adapter's UI consumers. Provider content stays in React memory.
export const placesUnavailable =
  'Google Maps is unavailable. Try again, or enter your venue details below.';

export function placesRequest(request, timeoutMs = 12000) {
  let timer;
  return Promise.race([
    Promise.resolve().then(request),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(placesUnavailable)), timeoutMs);
    }),
  ])
    .catch(() => {
      // SDK errors can include request URLs. Never expose or log the key/response.
      throw new Error(placesUnavailable);
    })
    .finally(() => clearTimeout(timer));
}

export function createPlacesLoader({
  getWindow,
  getDocument,
  getKey,
  timeoutMs = 12000,
}) {
  let loading;
  let sequence = 0;
  return function load() {
    if (loading) return loading;
    loading = placesRequest(async () => {
      const win = getWindow();
      const doc = getDocument();
      const key = getKey();
      if (!win || !doc || !key?.trim()) throw new Error(placesUnavailable);
      if (!win.google?.maps?.importLibrary) {
        await new Promise((resolve, reject) => {
          const callback = `__mmmPlacesReady${++sequence}`;
          const script = doc.createElement('script');
          const previousAuthFailure = win.gm_authFailure;
          let timer;
          let finished = false;
          const finish = (error) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            script.onerror = null;
            if (win.gm_authFailure === authFailure)
              win.gm_authFailure = previousAuthFailure;
            // A timed-out script may still execute its callback later.
            win[callback] = () => {};
            if (error) {
              script.remove();
              reject(new Error(placesUnavailable));
            } else resolve();
          };
          const authFailure = () => finish(true);
          win.gm_authFailure = authFailure;
          win[callback] = () => finish(false);
          script.async = true;
          script.onerror = () => finish(true);
          script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'weekly', loading: 'async', libraries: 'places', language: 'en', region: 'IN', callback })}`;
          timer = setTimeout(() => finish(true), timeoutMs);
          doc.head.append(script);
        });
      }
      return win.google.maps.importLibrary('places');
    }, timeoutMs + 1000).catch((error) => {
      loading = undefined;
      throw error;
    });
    return loading;
  };
}

export const loadGooglePlaces = createPlacesLoader({
  getWindow: () => (typeof window === 'undefined' ? undefined : window),
  getDocument: () => (typeof document === 'undefined' ? undefined : document),
  getKey: () => process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
});

export function livePlaceDetails(place) {
  return {
    name: place.displayName || 'Selected venue',
    address: place.formattedAddress || '',
    attributions: (place.attributions || []).map(
      ({ provider, providerURI }) => {
        let href;
        try {
          const url = new URL(providerURI);
          if (['https:', 'http:'].includes(url.protocol)) href = url.href;
        } catch {
          /* Show the provider name even when no safe URL is supplied. */
        }
        return { provider: provider || 'Data provider', href };
      },
    ),
  };
}
