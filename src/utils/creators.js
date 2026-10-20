export const cleanHandle = (creator) =>
  creator?.handle ? String(creator.handle).replace(/^@/, '') : null;

export function resolveAuthor(comment, creatorsById) {
  const id = comment.creatorId ?? comment.authorId ?? comment.userId ?? null;
  const creator = id ? creatorsById.get(id) : null;

  return {
    id: creator?.id ?? null,
    creator: creator ?? null,
    label: cleanHandle(creator) ?? creator?.name ?? comment.authorName ?? comment.author ?? 'someone',
  };
}
