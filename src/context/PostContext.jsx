import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as postService from '../services/postService.js';
import * as commentService from '../services/commentService.js';
import * as creatorService from '../services/creatorService.js';
import { postsApiEnabled, toggleRepost as toggleRepostRequest } from '../services/postService.js';
import { useAuth } from './AuthContext.jsx';

export const PostContext = createContext(null);

/*
 * Single source of truth for posts, comments, likes and creators.
 * Every page reads from here, so feed, explore, details and profile stay consistent.
 */
export function PostProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [creators, setCreators] = useState([]);
  const [likedList, setLikedList] = useState([]);
  const [loadedCommentPosts, setLoadedCommentPosts] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('');
  const [pagination, setPagination] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const feedRequestIdentity = useRef(0);

  useEffect(() => {
    if (authLoading) return undefined;
    const requestIdentity = ++feedRequestIdentity.current;
    let cancelled = false;
    setStatus('loading');
    setLoadError('');
    setLoadMoreError('');
    setPosts([]);
    setComments([]);
    setCreators([]);
    setLikedList([]);
    setLoadedCommentPosts([]);
    setPagination(null);
    setLoadingMore(false);
    Promise.all([
      postService.getPostsPage(),
      postsApiEnabled ? Promise.resolve([]) : creatorService.getCreators(),
    ])
      .then(([postPage, cr]) => {
        if (cancelled || requestIdentity !== feedRequestIdentity.current) return;
        const postCreators = postPage.posts.flatMap((post) => [
          post.creator,
          post.repostedBy ? {
            id: post.repostedBy.id,
            username: post.repostedBy.username,
            name: post.repostedBy.displayName,
            avatarUrl: post.repostedBy.avatarUrl,
          } : null,
        ]).filter(Boolean);
        const creatorsById = new Map([
          ...(postsApiEnabled ? [] : cr),
          ...postCreators,
        ].map((creator) => [creator.id, creator]));
        setPosts(postPage.posts);
        setComments(postPage.posts.flatMap((post) => post.recentComments ?? []));
        setCreators([...creatorsById.values()]);
        setLikedList(postPage.posts.filter((post) => post.likedByMe).map((post) => post.id));
        setLoadedCommentPosts([]);
        setPagination(postPage.pagination);
        setStatus('ready');
      })
      .catch((error) => {
        if (cancelled || requestIdentity !== feedRequestIdentity.current) return;
        setLoadError(error.message);
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [user?.id, authLoading]);

  const loadMorePosts = useCallback(async () => {
    if (!pagination || pagination.page >= pagination.totalPages || loadingMore) return;
    const requestIdentity = feedRequestIdentity.current;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const nextPage = await postService.getPostsPage(pagination.page + 1, pagination.pageSize);
      if (requestIdentity !== feedRequestIdentity.current) return;
      setPosts((previous) => {
        const known = new Set(previous.map((post) => post.feedEntryId ?? `post:${post.id}`));
        return [...previous, ...nextPage.posts.filter((post) => !known.has(post.feedEntryId ?? `post:${post.id}`))];
      });
      setCreators((previous) => {
        const byId = new Map(previous.map((creator) => [creator.id, creator]));
        nextPage.posts.forEach((post) => {
          if (post.creator) byId.set(post.creator.id, post.creator);
          if (post.repostedBy) byId.set(post.repostedBy.id, {
            id: post.repostedBy.id,
            username: post.repostedBy.username,
            name: post.repostedBy.displayName,
            avatarUrl: post.repostedBy.avatarUrl,
          });
        });
        return [...byId.values()];
      });
      setPagination(nextPage.pagination);
    } catch (error) {
      if (requestIdentity !== feedRequestIdentity.current) return;
      setLoadMoreError(error.message);
    } finally {
      if (requestIdentity === feedRequestIdentity.current) setLoadingMore(false);
    }
  }, [pagination, loadingMore]);

  const loadPostById = useCallback(async (postId) => {
    const requestIdentity = feedRequestIdentity.current;
    const post = await postService.getPostById(postId);
    if (!post || requestIdentity !== feedRequestIdentity.current) return null;
    setPosts((previous) => previous.some((item) => (item.feedEntryId ?? `post:${item.id}`) === `post:${post.id}`)
      ? previous
      : [...previous, { ...post, feedEntryId: `post:${post.id}` }].sort((left, right) => new Date(right.repostedBy?.createdAt ?? right.createdAt) - new Date(left.repostedBy?.createdAt ?? left.createdAt)));
    if (post.creator) {
      setCreators((previous) => [...new Map([...previous, post.creator].map((creator) => [creator.id, creator])).values()]);
    }
    if (post.likedByMe) {
      setLikedList((previous) => [...new Set([...previous, post.id])]);
    }
    return post;
  }, []);

  const createPost = useCallback(async (data) => {
    const post = await postService.createPost(data);
    setPosts((prev) => [{ ...post, feedEntryId: `post:${post.id}` }, ...prev]);
    if (post.creator) {
      setCreators((previous) => [...new Map([...previous, post.creator].map((creator) => [creator.id, creator])).values()]);
    }
    setPagination((previous) => previous ? { ...previous, total: previous.total + 1 } : previous);
    return post;
  }, []);

  const updatePost = useCallback(async (postId, changes) => {
    const post = await postService.updatePost(postId, changes);
    setPosts((prev) => prev.map((current) => (current.id === postId
      ? { ...post, feedEntryId: current.feedEntryId, repostedBy: current.repostedBy }
      : current)));
    return post;
  }, []);

  const deletePost = useCallback(async (postId) => {
    const existing = posts.find((post) => post.id === postId);
    const result = await postService.deletePost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setComments((prev) => prev.filter((c) => c.postId !== postId));
    setLikedList((prev) => prev.filter((id) => id !== postId));
    setPagination((previous) => previous ? {
      ...previous,
      total: Math.max(0, previous.total - 1 - (existing?.repostsCount ?? 0)),
    } : previous);
    return result;
  }, [posts]);

  const toggleLike = useCallback(async (postId) => {
    const existing = posts.find((post) => post.id === postId);
    if (!existing) throw new Error('This work is not available.');
    const requestIdentity = feedRequestIdentity.current;
    const result = await postService.toggleLike(postId, Boolean(existing.likedByMe));
    if (requestIdentity !== feedRequestIdentity.current) return;
    setPosts((prev) => prev.map((post) => (
      post.id === postId
        ? { ...post, likesCount: result.likesCount, likedByMe: result.likedByMe }
        : post
    )));
    setLikedList((prev) => (result.likedByMe ? [...new Set([...prev, postId])] : prev.filter((id) => id !== postId)));
  }, [posts]);

  const toggleRepost = useCallback(async (postId) => {
    const existing = posts.find((post) => post.id === postId);
    if (!existing) throw new Error('This work is not available.');
    const requestIdentity = feedRequestIdentity.current;
    const result = await toggleRepostRequest(postId, Boolean(existing.repostedByMe));
    if (requestIdentity !== feedRequestIdentity.current) return;
    setPosts((previous) => {
      const updated = previous.map((post) => (
        post.id === postId
          ? { ...post, repostsCount: result.repostsCount, repostedByMe: result.repostedByMe }
          : post
      ));
      if (result.repostedByMe && result.repostActivity) {
        const activity = result.repostActivity;
        const original = updated.find((post) => post.id === postId && !post.repostedBy)
          ?? updated.find((post) => post.id === postId);
        if (!original) return updated;
        const feedEntryId = `repost:${activity.id}`;
        return [
          { ...original, feedEntryId, repostedBy: activity },
          ...updated.filter((post) => post.feedEntryId !== feedEntryId),
        ];
      }
      if (result.removedRepostId) {
        return updated.filter((post) => post.feedEntryId !== `repost:${result.removedRepostId}`);
      }
      return updated;
    });
    setPagination((previous) => previous ? {
      ...previous,
      total: Math.max(0, previous.total + (result.repostChanged && result.repostedByMe ? 1 : result.repostChanged && result.removedRepostId ? -1 : 0)),
    } : previous);
  }, [posts]);

  const loadComments = useCallback(async (postId) => {
    const result = await commentService.getComments(postId);
    setComments((previous) => [
      ...previous.filter((comment) => comment.postId !== postId),
      ...result.comments,
    ]);
    setLoadedCommentPosts((previous) => [...new Set([...previous, postId])]);
    setPosts((previous) => previous.map((post) => (
      post.id === postId ? { ...post, commentsCount: result.commentCount } : post
    )));
    return result.comments;
  }, []);

  const addComment = useCallback(async (postId, text) => {
    const result = await commentService.addComment({ postId, text });
    setComments((prev) => [...prev, result.comment]);
    setLoadedCommentPosts((prev) => (prev.includes(postId) ? prev : [...prev, postId]));
    setPosts((prev) => prev.map((post) => (
      post.id === postId ? { ...post, commentsCount: result.commentCount } : post
    )));
    return result.comment;
  }, []);

  const deleteComment = useCallback(async (postId, commentId) => {
    const result = await commentService.deleteComment(postId, commentId);
    setComments((previous) => previous.filter((comment) => comment.id !== commentId));
    setPosts((previous) => previous.map((post) => (
      post.id === postId ? { ...post, commentsCount: result.commentCount } : post
    )));
  }, []);

  const value = useMemo(() => {
    const commentCounts = {};
    const commentsByPostId = new Map();
    comments.forEach((comment) => {
      const postComments = commentsByPostId.get(comment.postId) ?? [];
      postComments.push(comment);
      commentsByPostId.set(comment.postId, postComments);
    });
    posts.forEach((post) => {
      commentCounts[post.id] = post.commentsCount === null
        ? null
        : post.commentsCount ?? (commentsByPostId.get(post.id)?.length ?? 0);
    });
    return {
      status, loadError, posts, comments, creators, commentCounts, commentsByPostId,
      pagination, loadingMore, loadMoreError,
      postsById: new Map(posts.map((p) => [p.id, p])),
      creatorsById: new Map(creators.map((c) => [c.id, c])),
      likedIds: new Set(likedList),
      loadedCommentPosts: new Set(loadedCommentPosts),
      getInspiredWorks: postService.getInspiredWorks,
      loadMorePosts,
      loadPostById,
      createPost, updatePost, deletePost, toggleLike, toggleRepost,
      loadComments, addComment, deleteComment,
    };
  }, [status, loadError, posts, comments, creators, likedList, loadedCommentPosts, pagination, loadingMore, loadMoreError, loadMorePosts, loadPostById, createPost, updatePost, deletePost, toggleLike, toggleRepost, loadComments, addComment, deleteComment]);

  return <PostContext.Provider value={value}>{children}</PostContext.Provider>;
}
