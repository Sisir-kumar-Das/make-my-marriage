// Synthetic presentation data only. This is not a database seed or an API response.
export const sampleWedding = {
  couple: 'Ananya & Arjun',
  date: '10 February 2027',
  location: 'Bhubaneswar, Odisha',
};

export const sampleProgress = { completed: 18, total: 42, percent: 43 };
export const sampleSummary = {
  todo: 16,
  inProgress: 8,
  completed: 18,
  overdue: 4,
};

export const sampleTasks = [
  {
    id: 'sample-task-1',
    title: 'Finalize the wedding venue',
    detail: 'Venue · 20 Oct',
    priority: 'High',
    status: 'In progress',
  },
  {
    id: 'sample-task-2',
    title: 'Shortlist photographers',
    detail: 'Photography · 24 Oct',
    priority: 'Medium',
    status: 'To do',
  },
  {
    id: 'sample-task-3',
    title: 'Plan the ceremony schedule',
    detail: 'Wedding · 28 Oct',
    priority: 'Medium',
    status: 'To do',
  },
];

export const sampleEvents = [
  {
    id: 'sample-event-1',
    day: '08',
    month: 'FEB',
    name: 'Haldi',
    date: '8 Feb 2027',
    time: '10:00 AM',
    venue: 'Family home, Cuttack',
    status: 'Planned',
  },
  {
    id: 'sample-event-2',
    day: '10',
    month: 'FEB',
    name: 'Wedding',
    date: '10 Feb 2027',
    time: '6:00 PM',
    venue: 'Venue to be confirmed',
    status: 'Planned',
  },
  {
    id: 'sample-event-3',
    day: '11',
    month: 'FEB',
    name: 'Reception',
    date: '11 Feb 2027',
    time: '7:00 PM',
    venue: 'Bhubaneswar',
    status: 'Confirmed',
  },
];

export const sampleAttention = [
  {
    id: 'sample-alert-1',
    title: '4 tasks need a fresh look',
    detail: 'Sample overdue tasks awaiting follow-up.',
    href: '/tasks',
  },
  {
    id: 'sample-alert-2',
    title: 'Wedding venue is still open',
    detail: 'Sample event missing a confirmed venue.',
    href: '/events',
  },
];

export const sampleActivity = [
  {
    id: 'sample-activity-1',
    initials: 'RD',
    text: 'Rahul completed “Set a planning timeline”',
    time: '2 hours ago',
  },
  {
    id: 'sample-activity-2',
    initials: 'AA',
    text: 'Ananya updated the Haldi event',
    time: 'Yesterday',
  },
  {
    id: 'sample-activity-3',
    initials: 'AR',
    text: 'Arjun invited a family member',
    time: 'Yesterday',
  },
];
