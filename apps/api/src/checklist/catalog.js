// Versioned V1 planning content. Keep item keys stable when wording changes.
// Browsing this catalog performs no task generation or database writes.
const item = (key, title, description, priority, daysBeforeWedding) => ({
  key,
  title,
  description,
  priority,
  daysBeforeWedding,
});

const templates = [
  {
    id: 'initial-planning',
    version: '1',
    name: 'Initial Planning',
    category: 'Getting started',
    description:
      'Bring your priorities, dates and shared planning responsibilities together.',
    items: [
      item(
        'planning-priorities',
        'Agree on your wedding priorities',
        'Discuss the celebrations and details that matter most to you both.',
        'HIGH',
        180,
      ),
      item(
        'planning-budget',
        'Outline an estimated wedding budget',
        'Choose a comfortable overall estimate and note your main spending categories.',
        'HIGH',
        180,
      ),
      item(
        'celebration-outline',
        'Outline your ceremonies and celebrations',
        'List the occasions you want to plan, including any celebrations on other days.',
        'HIGH',
        150,
      ),
      item(
        'guest-estimate',
        'Prepare an initial guest estimate',
        'Collect approximate numbers from both families to guide venue and catering decisions.',
        'MEDIUM',
        150,
      ),
      item(
        'family-responsibilities',
        'Discuss family planning responsibilities',
        'Agree who will coordinate each area before assigning individual tasks.',
        'MEDIUM',
        120,
      ),
      item(
        'planning-review',
        'Schedule a family planning review',
        'Set aside time to review open decisions, deadlines and remaining preparations.',
        'MEDIUM',
        30,
      ),
    ],
  },
  {
    id: 'venue-logistics',
    version: '1',
    name: 'Venue & Logistics',
    category: 'Spaces & coordination',
    description:
      'Prepare your venue, access, seating and essential day-of arrangements.',
    items: [
      item(
        'venue-shortlist',
        'Shortlist suitable venues',
        'Compare capacity, accessibility, availability and the spaces needed for your celebrations.',
        'HIGH',
        150,
      ),
      item(
        'venue-booking',
        'Confirm the venue booking and inclusions',
        'Review agreed timings, available facilities and the venue contact details.',
        'HIGH',
        120,
      ),
      item(
        'venue-layout',
        'Review the seating and ceremony layout',
        'Check guest seating, entrances and the space needed by your ceremony team.',
        'MEDIUM',
        30,
      ),
      item(
        'venue-power',
        'Confirm sound and power arrangements',
        'Ask the venue team about equipment, sound checks and backup arrangements.',
        'HIGH',
        14,
      ),
      item(
        'venue-access',
        'Share arrival and venue access instructions',
        'Confirm parking, drop-off points and any entrance or floor details.',
        'MEDIUM',
        7,
      ),
      item(
        'venue-walkthrough',
        'Complete a final venue walkthrough',
        'Review the setup and confirm the contact person for the celebration day.',
        'HIGH',
        1,
      ),
    ],
  },
  {
    id: 'photography-video',
    version: '1',
    name: 'Photography & Video',
    category: 'Memories & coverage',
    description:
      'Coordinate your coverage, important moments and family photographs.',
    items: [
      item(
        'photo-shortlist',
        'Shortlist your photography and video team',
        'Review portfolios, coverage options and availability for your celebrations.',
        'HIGH',
        120,
      ),
      item(
        'photo-coverage',
        'Confirm coverage and delivery expectations',
        'Agree the events, working hours and expected photo and video deliverables.',
        'HIGH',
        90,
      ),
      item(
        'photo-shot-list',
        'Prepare your must-have photo list',
        'Note important moments, family groups and any personal preferences.',
        'MEDIUM',
        30,
      ),
      item(
        'photo-schedule',
        'Share the ceremony schedule with the team',
        'Discuss arrivals, venue changes and time for couple and family portraits.',
        'HIGH',
        14,
      ),
      item(
        'photo-family-contact',
        'Choose a family photo coordinator',
        'Pick a contact who can help gather people for group photographs.',
        'MEDIUM',
        7,
      ),
      item(
        'photo-final-brief',
        'Confirm the final photography briefing',
        'Recheck the team arrival time, key contacts and agreed priorities.',
        'MEDIUM',
        2,
      ),
    ],
  },
  {
    id: 'attire-jewellery',
    version: '1',
    name: 'Attire & Jewellery',
    category: 'Styling & finishing touches',
    description:
      'Organize outfits, fittings, accessories and comfortable finishing touches.',
    items: [
      item(
        'attire-outfit-list',
        'List outfits for each celebration',
        'Plan clothing for both partners and note any outfit changes.',
        'MEDIUM',
        90,
      ),
      item(
        'attire-fitting',
        'Arrange outfit fittings and alterations',
        'Allow time to check fit, movement and any required adjustments.',
        'HIGH',
        30,
      ),
      item(
        'attire-accessories',
        'Coordinate jewellery and accessories',
        'Match the pieces you plan to wear and confirm who will bring them.',
        'MEDIUM',
        21,
      ),
      item(
        'attire-footwear',
        'Try footwear with your outfits',
        'Check comfort and fit before the celebration day.',
        'LOW',
        14,
      ),
      item(
        'attire-collection',
        'Collect outfits and check the final fit',
        'Confirm all alterations are complete and arrange pressing or steaming.',
        'HIGH',
        7,
      ),
      item(
        'attire-packing',
        'Pack labelled outfit and accessory sets',
        'Keep each celebration’s clothing and accessories together with any essentials.',
        'MEDIUM',
        2,
      ),
    ],
  },
];

export function readChecklistCatalog() {
  return structuredClone({
    templates: templates.map((template) => ({
      ...template,
      itemCount: template.items.length,
    })),
    plannedTemplates: [
      {
        id: 'odia-rituals',
        name: 'Essential Odia Wedding Rituals',
        category: 'Rituals & culture',
        description:
          'Tradition-specific ceremony preparations and ritual guidance are planned for a later increment.',
      },
    ],
  });
}
