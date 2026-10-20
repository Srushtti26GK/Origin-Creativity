/*
 * Frontend data contract (not a database schema):
 * { id, title, description, creatorId, category, tags[], media{type,url,alt,aspect},
 *   workType: 'original' | 'inspired', sourcePostId, inspirationNote,
 *   authenticity{ declaration: 'original'|'inspired'|null, verificationStatus: 'unverified'|'pending'|'verified' },
 *   createdAt }
 * media.url is empty for seed data: artwork is generated locally (see utils/artwork.js).
 */
const post = (id, creatorId, category, title, description, tags, aspect, createdAt, extra = {}) => ({
  id, title, description, creatorId, category, tags,
  media: { type: 'image', url: '', alt: `Artwork titled “${title}”`, aspect },
  workType: 'original', sourcePostId: null, inspirationNote: null,
  authenticity: { declaration: 'original', verificationStatus: 'unverified' },
  createdAt, ...extra,
});

const inspiredBy = (sourcePostId, inspirationNote, verificationStatus = 'unverified') => ({
  workType: 'inspired', sourcePostId, inspirationNote,
  authenticity: { declaration: 'inspired', verificationStatus },
});

export const mockPosts = [
  post('post-001', 'creator-001', 'painting', 'Monsoon Over the Backwaters', 'Wet-on-wet watercolour painted from the boat shed after a week of rain. The horizon dissolves into the sky on purpose.', ['watercolour', 'landscape', 'monsoon'], 'landscape', '2026-10-02T09:30:00.000Z', { authenticity: { declaration: 'original', verificationStatus: 'verified' } }),
  post('post-002', 'creator-002', 'illustration', 'Forty Minutes of Hands', 'A single continuous ink line studying hands at a tea stall. No pencil underdrawing, no corrections.', ['ink', 'figure study', 'line'], 'portrait', '2026-10-04T14:10:00.000Z'),
  post('post-003', 'creator-003', 'pottery', 'Pit-Fired Water Jar', 'Wheel-thrown stoneware, burnished and pit fired with sawdust and banana peel. The dark clouds are from the fire, not glaze.', ['stoneware', 'pit firing', 'vessel'], 'square', '2026-10-05T08:00:00.000Z', { authenticity: { declaration: 'original', verificationStatus: 'pending' } }),
  post('post-004', 'creator-004', 'poetry', 'Small Hours', 'The kettle clears its throat, the street forgets its name. Somewhere a window learns the shape of morning.', ['poem', 'night', 'short form'], 'portrait', '2026-10-06T22:45:00.000Z'),
  post('post-005', 'creator-003', 'dance', 'Turning', 'A two-minute solo about returning to a place that has changed. Filmed in one take on the studio floor.', ['contemporary', 'solo', 'movement'], 'landscape', '2026-10-09T17:20:00.000Z', inspiredBy('post-004', 'I built the rhythm from the last line of Kabir’s poem and let the phrase repeat until it stopped meaning anything.')),
  post('post-006', 'creator-002', 'illustration', 'Backwater Study in Ink', 'Meera’s painting translated into hatching and negative space. I kept her horizon but swapped colour for density.', ['ink', 'landscape', 'hatching'], 'landscape', '2026-10-10T11:05:00.000Z', inspiredBy('post-001', 'Inspired by the way the horizon dissolves. I tried to get the same softness using only line weight.')),
  post('post-007', 'creator-004', 'digital', 'Blue Hour Gradient', 'A generative gradient study in three layers of light, made after looking at the shed-light in the backwaters painting.', ['gradient', 'generative', 'blue'], 'square', '2026-10-11T19:40:00.000Z', inspiredBy('post-001', 'Inspired by the use of light and colour. The code is mine; the palette idea is hers.')),
  post('post-008', 'creator-001', 'photography', 'Rain on a Tin Roof', 'Handheld, 1/60s, no tripod. The blur is the rain doing its own brushwork.', ['street', 'rain', 'texture'], 'portrait', '2026-10-12T07:15:00.000Z', { authenticity: { declaration: null, verificationStatus: 'unverified' } }),
  post('post-009', 'creator-005', 'crafts', 'Indigo Resist Banner', 'Cotton banner dyed in a fermentation vat using hand-cut paper resists. Each fold left its own pattern.', ['indigo', 'textile', 'dyeing'], 'portrait', '2026-10-13T10:00:00.000Z'),
  post('post-010', 'creator-005', 'music', 'Rooftop Alaap (Sketch)', 'A slow melodic sketch recorded at dusk, built around one tone.', ['alaap', 'sketch', 'voice'], 'square', '2026-10-14T18:30:00.000Z', inspiredBy('post-003', 'I tapped the rim of Isha’s jar and built the whole melody around the tone it gave back.')),
  post('post-011', 'creator-001', 'painting', 'Indigo Study No. 3', 'A small oil sketch using the blue-to-white fade I saw in Nila’s banner. Not a copy: different subject, same question about edges.', ['oil', 'indigo', 'study'], 'portrait', '2026-10-15T13:25:00.000Z', inspiredBy('post-009', 'Inspired by how the indigo fades unevenly where the cloth was folded.', 'pending')),
  post('post-012', 'creator-004', 'poetry', 'After the Monsoon', 'Four lines about the smell of a street the morning after rain. Written in reply to a poem that has since been taken down.', ['poem', 'rain'], 'portrait', '2026-10-16T06:50:00.000Z', inspiredBy('post-099', 'Inspired by a poem that is no longer available.')),
];
