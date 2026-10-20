export const CATEGORIES = [
  { id: 'painting', label: 'Painting' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'photography', label: 'Photography' },
  { id: 'pottery', label: 'Pottery' },
  { id: 'poetry', label: 'Poetry' },
  { id: 'music', label: 'Music' },
  { id: 'dance', label: 'Dance' },
  { id: 'digital', label: 'Digital Art' },
  { id: 'crafts', label: 'Crafts' },
];

export const getCategoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
