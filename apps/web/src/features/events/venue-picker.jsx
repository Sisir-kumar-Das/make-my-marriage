'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Search, LoaderCircle, ExternalLink } from 'lucide-react';
import {
  loadGooglePlaces,
  placesRequest,
  placesUnavailable,
  livePlaceDetails,
} from './google-places';
import { mapsLink } from './form-data';
import {
  sameVenueSelection,
  venueDetailAttempt,
  nextSuggestionIndex,
  currentVenueSearch,
} from './venue-state';
import styles from './venue-picker.module.css';

function Attribution({ providers = [] }) {
  return (
    <div className={styles.attribution}>
      <span translate="no">Google Maps</span>
      {providers.map(({ provider, href }, index) =>
        href ? (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer">
            {provider}
          </a>
        ) : (
          <span key={index}>{provider}</span>
        ),
      )}
    </div>
  );
}

export function GoogleVenueDetails(props) {
  return <SelectedVenueDetails key={props.placeId} {...props} />;
}

function SelectedVenueDetails({ placeId, prediction }) {
  const [retry, setRetry] = useState(null);
  const attempt = venueDetailAttempt(retry, { placeId, prediction });
  const [result, setResult] = useState(null);
  const key = `${placeId}:${attempt}`;
  useEffect(() => {
    let active = true;
    const selection = { placeId, prediction };
    void placesRequest(async () => {
      const { Place } = await loadGooglePlaces();
      if (!active) return null;
      const place =
        attempt === 0 && prediction?.placeId === placeId
          ? prediction.toPlace()
          : new Place({ id: placeId });
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'attributions'],
      });
      return livePlaceDetails(place);
    }).then(
      (data) => {
        if (active) setResult({ key, selection, data });
      },
      () => {
        if (active) setResult({ key, selection, error: true });
        active = false;
      },
    );
    return () => {
      active = false;
    };
  }, [placeId, prediction, key, attempt]);
  const current =
    result?.key === key &&
    sameVenueSelection(result.selection, { placeId, prediction })
      ? result
      : null;
  const map = mapsLink({
    source: 'GOOGLE',
    googlePlaceId: placeId,
    name: current?.data?.name,
    formattedAddress: current?.data?.address,
  });
  return (
    <section
      className={styles.googleCard}
      aria-label="Selected Google Maps venue"
    >
      <span className={styles.caption}>Linked venue · Live details</span>
      {!current && (
        <p role="status">
          <LoaderCircle
            size={15}
            className={styles.spinner}
            aria-hidden="true"
          />
          Loading venue…
        </p>
      )}
      {current?.error && (
        <div role="status">
          <p>
            Venue details couldn’t load. Your linked venue and entered details
            are kept.
          </p>
          <button
            type="button"
            className={styles.textButton}
            onClick={() =>
              setRetry({
                selection: { placeId, prediction },
                attempt: attempt + 1,
              })
            }
          >
            Retry venue details
          </button>
        </div>
      )}
      {current?.data && (
        <>
          <h4>{current.data.name}</h4>
          <p>{current.data.address}</p>
          <Attribution providers={current.data.attributions} />
        </>
      )}
      {map && (
        <a
          className={styles.mapLink}
          href={map}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open linked venue in Maps{' '}
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}

export function VenuePicker({ control, setValue, disabled }) {
  const placeId = useWatch({ control, name: 'googlePlaceId' });
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [searchToken, setSearchToken] = useState(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const input = useRef(null);
  const session = useRef(null);
  const generation = useRef(0);
  const disabledRef = useRef(disabled);
  const id = useId();
  const lookup = query.trim();
  const key = `${lookup}:${attempt}`;
  const current = currentVenueSearch(result, key, searchToken);
  const suggestions = current?.suggestions || [];
  const expanded = !disabled && open && lookup.length >= 3;
  useEffect(() => {
    if (expanded && activeIndex >= 0)
      document
        .getElementById(`${id}-option-${activeIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [expanded, activeIndex, id]);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  useEffect(() => {
    const request = ++generation.current;
    if (disabled || lookup.length < 3 || !open) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void placesRequest(async () => {
        const { AutocompleteSessionToken, AutocompleteSuggestion } =
          await loadGooglePlaces();
        if (!active || generation.current !== request || disabledRef.current)
          return { suggestions: [], sessionToken: null };
        session.current ||= new AutocompleteSessionToken();
        const sessionToken = session.current;
        setSearchToken(sessionToken);
        const response =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: lookup,
            sessionToken,
            includedRegionCodes: ['in'],
            language: 'en',
            region: 'in',
          });
        const suggestions = response.suggestions
          .filter((row) => row.placePrediction)
          .slice(0, 5)
          .map((row) => row.placePrediction);
        return { suggestions, sessionToken };
      }).then(
        (response) => {
          if (active && request === generation.current)
            setResult({ key, ...response });
        },
        () => {
          if (active && request === generation.current) {
            session.current = null;
            setSearchToken(null);
            setResult({ key, error: true });
          }
          active = false;
        },
      );
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [lookup, key, open, disabled]);

  function choose(prediction) {
    if (
      disabledRef.current ||
      !session.current ||
      !suggestions.includes(prediction) ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(prediction.placeId || '')
    )
      return;
    // Commit only the ID synchronously; a later details response cannot change a save payload.
    generation.current++;
    setValue('googlePlaceId', prediction.placeId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setChosen(prediction);
    session.current = null;
    setSearchToken(null);
    setResult(null);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    input.current?.focus();
  }
  return (
    <div className={styles.picker}>
      <label htmlFor={id}>Search Google Maps</label>
      <div className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          id={id}
          role="combobox"
          type="search"
          autoComplete="off"
          maxLength={160}
          placeholder="Search a venue or address in India…"
          value={query}
          disabled={disabled}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? id + '-results' : undefined}
          aria-activedescendant={
            expanded && suggestions[activeIndex]
              ? `${id}-option-${activeIndex}`
              : undefined
          }
          aria-describedby={id + '-help'}
          onChange={(event) => {
            generation.current++;
            setResult(null);
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (lookup.length >= 3) setOpen(true);
          }}
          onBlur={(event) => {
            if (
              !event.currentTarget.parentElement.parentElement.contains(
                event.relatedTarget,
              )
            )
              setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && expanded) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (expanded && suggestions[activeIndex])
                choose(suggestions[activeIndex]);
            }
            if (
              ['ArrowDown', 'ArrowUp'].includes(event.key) &&
              suggestions.length
            ) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) =>
                nextSuggestionIndex(index, suggestions.length, event.key),
              );
            }
          }}
        />
      </div>
      {expanded && (
        <div className={styles.results}>
          <ul
            role="listbox"
            id={id + '-results'}
            aria-label="Google Maps suggestions"
          >
            {suggestions.map((prediction, index) => (
              <li
                role="option"
                aria-selected={activeIndex === index}
                key={prediction.placeId}
                id={`${id}-option-${index}`}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(prediction)}
                >
                  <strong>
                    {prediction.mainText?.toString() ||
                      prediction.text.toString()}
                  </strong>
                  {prediction.secondaryText && (
                    <span>{prediction.secondaryText.toString()}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!current && <p role="status">Searching venues…</p>}
          {current && !current.error && !suggestions.length && (
            <p role="status">
              No venues found. Try a different name or enter details below.
            </p>
          )}
          {current?.error && (
            <div role="status">
              <p>{placesUnavailable}</p>
              <button
                type="button"
                disabled={disabled}
                className={styles.textButton}
                onClick={() => {
                  setResult(null);
                  setAttempt((value) => value + 1);
                }}
              >
                Retry search
              </button>
            </div>
          )}
          <Attribution />
        </div>
      )}
      <p id={id + '-help'} className={styles.help}>
        Search is optional. Your own venue label, address and directions below
        are saved separately.
      </p>
      {placeId && (
        <>
          <GoogleVenueDetails
            placeId={placeId}
            prediction={chosen?.placeId === placeId ? chosen : undefined}
          />
          <button
            type="button"
            disabled={disabled}
            className={styles.textButton}
            onClick={() => {
              generation.current++;
              setValue('googlePlaceId', '', {
                shouldDirty: true,
                shouldValidate: true,
              });
              setChosen(null);
              setResult(null);
              setActiveIndex(-1);
              setQuery('');
              setOpen(false);
              session.current = null;
              setSearchToken(null);
            }}
          >
            Unlink Google Maps venue
          </button>
          <p className={styles.help}>
            Unlinking keeps the details you entered below. Google’s live name
            and address may change over time.
          </p>
        </>
      )}
      <p className={styles.legal}>
        Using search shares your query with Google.{' '}
        <Link href="/privacy" target="_blank" rel="noopener noreferrer">
          Privacy
        </Link>{' '}
        ·{' '}
        <Link href="/terms" target="_blank" rel="noopener noreferrer">
          Terms
        </Link>
      </p>
    </div>
  );
}
