const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function initials(name) {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => characters.segment(word).containing(0).segment)
    .join('')
    .toLocaleUpperCase();
}
