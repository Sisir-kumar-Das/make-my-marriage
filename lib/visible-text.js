// The virama must belong to the same script as its surrounding letters.
const viramaScripts = new Map([
  ['\u094D', /\p{Script=Devanagari}/u],
  ['\u09CD', /\p{Script=Bengali}/u],
  ['\u0A4D', /\p{Script=Gurmukhi}/u],
  ['\u0ACD', /\p{Script=Gujarati}/u],
  ['\u0B4D', /\p{Script=Oriya}/u],
  ['\u0BCD', /\p{Script=Tamil}/u],
  ['\u0C4D', /\p{Script=Telugu}/u],
  ['\u0CCD', /\p{Script=Kannada}/u],
  ['\u0D4D', /\p{Script=Malayalam}/u],
  ['\u0DCA', /\p{Script=Sinhala}/u],
]);

function joinerShapesText(joiner, index, name) {
  const before = name.slice(0, index);
  const after = name.slice(index + 1);
  const previousLetter = before.match(/(\p{L})\p{M}*$/u)?.[1];
  const nextLetter = after.match(/^\p{L}/u)?.[0];
  const isJoiner = joiner === '\u200D';
  if (
    isJoiner &&
    /\p{Extended_Pictographic}\p{Emoji_Modifier}?$/u.test(before) &&
    /^\p{Extended_Pictographic}/u.test(after)
  )
    return true;

  if (!previousLetter) return false;
  if (
    !isJoiner &&
    nextLetter &&
    /\p{Script=Arabic}/u.test(previousLetter) &&
    /\p{Script=Arabic}/u.test(nextLetter)
  )
    return true;

  const previous = before.at(-1);
  const next = after[0];
  const script = viramaScripts.get(previous);
  if (script?.test(previousLetter)) {
    if (nextLetter) return script.test(nextLetter);
    // Independent Devanagari half-forms and legacy Malayalam chillu forms.
    return (
      isJoiner &&
      (previous === '\u094D' || previous === '\u0D4D') &&
      /^(?:$|[\p{Zs}\p{P}])/u.test(after)
    );
  }

  // Some conjuncts place the join control before the virama.
  if (isJoiner && before.endsWith('\u09B0') && after.startsWith('\u09CD\u09AF'))
    return true;
  if (
    next !== '\u0D4D' &&
    (!isJoiner || !/[\u0B4D\u0C4D\u0CCD]/u.test(next ?? ''))
  )
    return false;
  const followingLetter = after.slice(1).match(/^\p{L}/u)?.[0];
  const followingScript = viramaScripts.get(next);
  return !!(
    followingLetter &&
    followingScript?.test(previousLetter) &&
    followingScript.test(followingLetter)
  );
}

export function visibleText(name) {
  // Keep shaping marks used within written names and visible emoji.
  const text = name
    .replace(/(?<=[\p{L}\p{N}\p{S}])\p{Variation_Selector}/gu, '')
    .replace(/\p{Join_Control}/gu, (joiner, index, value) =>
      joinerShapesText(joiner, index, value) ? '' : joiner,
    );
  return (
    !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800]/u.test(
      text,
    ) && /[\p{L}\p{N}\p{P}\p{S}]/u.test(text)
  );
}
