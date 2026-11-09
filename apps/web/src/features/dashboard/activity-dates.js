const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
const dateLabel = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeLabel = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function dayLabel(instant, now) {
  const date = dayKey.format(instant);
  if (date === dayKey.format(now)) return 'Today';
  if (date === dayKey.format(now - 86400000)) return 'Yesterday';
  return null;
}

export function activityTime(value, now) {
  const instant = new Date(value);
  return `${dayLabel(instant, now) || dateLabel.format(instant)}, ${timeLabel.format(instant)} IST`;
}

export function activityGroups(items, now) {
  const groups = new Map();
  for (const item of items) {
    const instant = new Date(item.createdAt);
    const key = dayKey.format(instant);
    if (!groups.has(key)) {
      const relative = dayLabel(instant, now);
      const date = dateLabel.format(instant);
      groups.set(key, {
        key,
        title: relative ? `${relative} — ${date}` : date,
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}
