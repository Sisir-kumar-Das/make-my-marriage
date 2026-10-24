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
