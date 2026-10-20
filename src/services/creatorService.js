import { mockCreators } from '../data/mockCreators.js';
import { delay } from './mockRepository.js';

// Later: GET /api/creators
export async function getCreators() {
  await delay(200);
  return mockCreators;
}

// Later: GET /api/creators/:creatorId
export async function getCreatorById(creatorId) {
  await delay();
  return mockCreators.find((c) => c.id === creatorId) ?? null;
}
