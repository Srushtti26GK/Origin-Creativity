export const ROUTES = {
  home: '/',
  explore: '/explore',
  create: '/create',
  notifications: '/notifications',
  post: '/post/:postId',
  editPost: '/post/:postId/edit',
  profile: '/profile/:creatorId',
};

export const postPath = (postId) => `/post/${postId}`;
export const editPostPath = (postId) => `/post/${postId}/edit`;
export const profilePath = (creatorId) => `/profile/${creatorId}`;
