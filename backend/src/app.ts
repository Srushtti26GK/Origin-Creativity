import cors from 'cors';
import express from 'express';
import type { Store } from 'express-session';
import helmet from 'helmet';
import type { UserRepository } from './repositories/user.repository.js';
import { createUserRepository } from './repositories/user.repository.js';
import type { PostRepository } from './repositories/post.repository.js';
import { createPostRepository } from './repositories/post.repository.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { createSessionMiddleware, postgresSessionStore } from './config/session.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createUsersRouter } from './routes/users.routes.js';
import { createPostsRouter } from './routes/posts.routes.js';
import type { FollowRepository } from './repositories/follow.repository.js';
import { createFollowRepository } from './repositories/follow.repository.js';
import { cloudinaryImageStorage } from './services/cloudinaryImageStorage.js';
import type { ImageStorage } from './services/cloudinaryImageStorage.js';
import { createUploadsRouter } from './routes/uploads.routes.js';
import type { SocialRepository } from './repositories/social.repository.js';
import { createSocialRepository } from './repositories/social.repository.js';
import { createSocialRouter } from './routes/social.routes.js';
import { createNotificationRepository } from './repositories/notification.repository.js';
import type { NotificationRepository } from './repositories/notification.repository.js';
import { createNotificationsRouter } from './routes/notifications.routes.js';

interface AppOptions {
  sessionStore?: Store;
  users?: UserRepository;
  posts?: PostRepository;
  follows?: FollowRepository;
  imageStorage?: ImageStorage;
  social?: SocialRepository;
  notifications?: NotificationRepository;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const users = options.users ?? createUserRepository(pool);
  const posts = options.posts ?? createPostRepository(pool);
  const follows = options.follows ?? createFollowRepository(pool);
  const imageStorage = options.imageStorage ?? cloudinaryImageStorage;
  const social = options.social ?? createSocialRepository(pool);
  const notifications = options.notifications ?? createNotificationRepository(pool);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: env.frontendOrigins,
    credentials: true,
  }));
  app.use(express.json({ limit: '16kb' }));
  app.use(createSessionMiddleware(options.sessionStore ?? postgresSessionStore));
  app.use('/api/health', healthRouter);
  app.use('/api/auth', createAuthRouter(users, env.frontendOrigins));
  app.use('/api/users', createUsersRouter(users, env.frontendOrigins, follows));
  app.use('/api/notifications', createNotificationsRouter(notifications, env.frontendOrigins));
  app.use('/api/posts', createSocialRouter(social, env.frontendOrigins));
  app.use('/api/posts', createPostsRouter(posts, env.frontendOrigins, imageStorage, social));
  app.use('/api/uploads', createUploadsRouter(imageStorage, env.frontendOrigins));
  app.use((_request, response) => {
    response.status(404).json({ status: 'error', message: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}

export const app = createApp();
