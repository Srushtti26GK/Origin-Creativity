import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { UserAccount, UserProfile, UserRepository } from '../repositories/user.repository.js';

export interface SignupInput {
  username: string;
  email: string;
  password: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
}

export class SignupValidationError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super('Invalid signup data');
  }
}

export class DuplicateAccountError extends Error {
  constructor(readonly field: 'username' | 'email') {
    super(`An account with that ${field} already exists`);
  }
}

export class LoginValidationError extends Error {
  constructor() {
    super('Enter a username or email and password.');
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username/email or password');
  }
}

export function validateSignup(body: unknown): SignupInput {
  const fields: Record<string, string> = {};
  const values = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};

  const username = typeof values.username === 'string' ? values.username.trim().toLowerCase() : '';
  const email = typeof values.email === 'string' ? values.email.trim().toLowerCase() : '';
  const password = typeof values.password === 'string' ? values.password : '';
  const displayName = typeof values.displayName === 'string' ? values.displayName.trim() : '';
  const bioInput = values.bio === undefined || values.bio === null
    ? ''
    : typeof values.bio === 'string' ? values.bio.trim() : null;
  const avatarInput = values.avatarUrl === undefined || values.avatarUrl === null
    ? ''
    : typeof values.avatarUrl === 'string' ? values.avatarUrl.trim() : null;

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    fields.username = 'Use 3–30 lowercase letters, numbers, or underscores.';
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields.email = 'Enter a valid email address.';
  }
  if (password.length < 12 || password.length > 128) {
    fields.password = 'Password must be between 12 and 128 characters.';
  }
  if (displayName.length < 1 || displayName.length > 80) {
    fields.displayName = 'Display name must be between 1 and 80 characters.';
  }

  const bio = bioInput === null ? null : bioInput || null;
  if (bioInput === null || (bio !== null && bio.length > 500)) {
    fields.bio = 'Bio must be a string of at most 500 characters.';
  }

  let avatarUrl: string | null = null;
  if (avatarInput === null) {
    fields.avatarUrl = 'Avatar URL must be a valid HTTP or HTTPS URL.';
  } else if (avatarInput) {
    try {
      const parsed = new URL(avatarInput);
      if (!['http:', 'https:'].includes(parsed.protocol) || avatarInput.length > 2048) {
        fields.avatarUrl = 'Avatar URL must be a valid HTTP or HTTPS URL.';
      } else {
        avatarUrl = parsed.toString();
      }
    } catch {
      fields.avatarUrl = 'Avatar URL must be a valid HTTP or HTTPS URL.';
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new SignupValidationError(fields);
  }

  return { username, email, password, displayName, bio, avatarUrl };
}

export async function signup(body: unknown, users: UserRepository): Promise<UserProfile> {
  const input = validateSignup(body);
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  try {
    return await users.create({
      id: randomUUID(),
      username: input.username,
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      if (error.constraint === 'users_username_lower_unique') {
        throw new DuplicateAccountError('username');
      }
      if (error.constraint === 'users_email_lower_unique') {
        throw new DuplicateAccountError('email');
      }
    }
    throw error;
  }
}

export function validateLogin(body: unknown): { identifier: string; password: string } {
  const values = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const identifier = typeof values.identifier === 'string'
    ? values.identifier.trim().toLowerCase()
    : '';
  const password = typeof values.password === 'string' ? values.password : '';

  if (!identifier || identifier.length > 254 || !password || password.length > 128) {
    throw new LoginValidationError();
  }
  return { identifier, password };
}

export async function login(
  body: unknown,
  users: UserRepository,
): Promise<UserProfile> {
  const { identifier, password } = validateLogin(body);
  const account: UserAccount | null = await users.findByLoginIdentifier(identifier);
  if (!account || !(await argon2.verify(account.passwordHash, password))) {
    throw new InvalidCredentialsError();
  }
  const { passwordHash: _passwordHash, email: _email, ...profile } = account;
  return profile;
}

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
