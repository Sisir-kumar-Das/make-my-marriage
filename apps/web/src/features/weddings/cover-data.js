export const defaultFrame = { x: 0.5, y: 0.5, zoom: 1 };
export const MAX_COVER_BYTES = 15_000_000;
export function coverFileError(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type))
    return 'Choose a JPG or PNG photo.';
  if (!file.size || file.size > MAX_COVER_BYTES)
    return 'Choose a photo up to 15 MB.';
  return '';
}
export function frameStyle(frame = defaultFrame) {
  const position = `${frame.x * 100}% ${frame.y * 100}%`;
  return {
    objectPosition: position,
    transformOrigin: position,
    transform: `scale(${frame.zoom})`,
  };
}
export function draggedFrame(frame, { width, height }, image, dx, dy) {
  const scale =
    Math.max(width / image.width, height / image.height) * frame.zoom;
  const overflowX = Math.max(0, image.width * scale - width);
  const overflowY = Math.max(0, image.height * scale - height);
  const clamp = (value) =>
    Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
  return {
    ...frame,
    x: overflowX > 0.01 ? clamp(frame.x - dx / overflowX) : frame.x,
    y: overflowY > 0.01 ? clamp(frame.y - dy / overflowY) : frame.y,
  };
}

// Which sliders can move the photo in the 2:1 frame (ADR-044). A photo that already fits
// one direction exactly has nothing to slide there until it is zoomed in.
export function movableAxes(image, zoom = 1, aspect = 2) {
  if (!image?.width || !image?.height) return { x: true, y: true };
  const scale = Math.max(aspect / image.width, 1 / image.height) * zoom;
  return {
    x: image.width * scale - aspect > 0.005,
    y: image.height * scale - 1 > 0.005,
  };
}

// Dashboard cover menu (owner, 4 Nov; ADR-044 revision 2). Everyone may view a custom photo
// once it has loaded; only Admins outside read-only previews may change it. The signature
// artwork has no View photo.
export function coverActions({ role, readOnly = false, hasPhoto, photoReady }) {
  return {
    canView: !!hasPhoto && !!photoReady,
    canChange: role === 'ADMIN' && !readOnly,
  };
}

// Whether a point lies on the visible picture of an object-fit: contain image, given the
// image box and the picture's natural size (the rest of the box is empty letterbox).
export function onContainedPicture(box, natural, point) {
  if (!natural?.width || !natural?.height) return false;
  const scale = Math.min(
    box.width / natural.width,
    box.height / natural.height,
  );
  const width = natural.width * scale;
  const height = natural.height * scale;
  const left = box.left + (box.width - width) / 2;
  const top = box.top + (box.height - height) / 2;
  return (
    point.x >= left &&
    point.x <= left + width &&
    point.y >= top &&
    point.y <= top + height
  );
}

// The photo click that ends the very press which dismissed the cover menu must not reopen it.
// Presses are compared by their event time stamps (pointerdown).
export function sameMenuPress(photoPress, closingPress) {
  return photoPress === closingPress;
}

// The full-photo viewer closes on a click only when the press both started and ended on the
// dark area (not on the picture, not a button), so drags and text selection never close it.
export function viewerPressCloses({ down, up, onButton }) {
  return !!down && !!up && !onButton;
}
