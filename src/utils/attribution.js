export const AUTHENTICITY_STATUSES = {
  declared_original: { label: 'Creator Declared Original', tone: 'declared', description: 'The creator says this is their own original work. This is a declaration, not independent verification.' },
  declared_inspired: { label: 'Creator Declared Inspired', tone: 'inspired', description: 'The creator says this work was inspired by another work and has identified it as a source.' },
  pending: { label: 'Verification Pending', tone: 'pending', description: 'A verification process has started but is not finished. No conclusion has been reached.' },
  verified: { label: 'Verified', tone: 'verified', description: 'A verification process was completed according to Origin’s verification policy. (Mock data only in this prototype.)' },
  unverified: { label: 'Unverified', tone: 'unverified', description: 'No declaration or verification is on record for this work.' },
};

// A declaration is never promoted to "verified": only verificationStatus can do that.
export function getAuthenticityStatus(post) {
  const { declaration, verificationStatus } = post.authenticity ?? {};
  if (verificationStatus === 'verified') return 'verified';
  if (verificationStatus === 'pending') return 'pending';
  if (declaration === 'original') return 'declared_original';
  if (declaration === 'inspired') return 'declared_inspired';
  return 'unverified';
}

// Derived from the structured sourcePostId, never from typed text.
export function resolveAttribution(post, postsById, creatorsById) {
  if (post.workType !== 'inspired' || !post.sourcePostId) return { kind: 'none' };
  const source = postsById.get(post.sourcePostId);
  if (!source) return { kind: 'missing' };
  return { kind: 'linked', source, sourceCreator: creatorsById.get(source.creatorId) ?? null };
}

export const selectInspiredWorks = (posts, sourcePostId) =>
  posts.filter((p) => p.sourcePostId === sourcePostId);
