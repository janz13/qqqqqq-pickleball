'use server';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import type { Session } from '@/types/models';

export interface OrganizerJwtPayload {
  uid: string;
  username: string;
  isGuest?: boolean;
}

export interface CloudSessionStateJson {
  session?: (Partial<Session> & { deleted?: boolean }) | null;
  players?: unknown[];
  courts?: unknown[];
  matches?: unknown[];
  endedAtEpochMs?: number;
}

export interface CloudSessionRow {
  id: string;
  join_code: string;
  owner_uid: string;
  is_active: boolean;
  updated_at: string;
  state_json: CloudSessionStateJson | null;
}

const MAX_AUTH_ATTEMPTS = 5;
const AUTH_WINDOW_MS = 60_000;
const GUEST_UID_REGEX = /^guest_[a-z0-9_-]{4,32}$/i;
const USERNAME_REGEX = /^[a-z0-9_.\-\[\]]+$/i;

const authAttempts = new Map<string, { count: number; resetAt: number }>();

const globalForSecret = globalThis as typeof globalThis & {
  __qqqqqqEphemeralSecret?: Uint8Array;
};

function getJwtSecretKey(): Uint8Array {
  const configured = process.env.SESSION_SECRET_KEY;
  if (configured && configured.length >= 32) {
    return new TextEncoder().encode(configured);
  }
  if (process.env.VERCEL === '1') {
    throw new Error('Server configuration error: SESSION_SECRET_KEY (min 32 chars) must be configured.');
  }
  if (!globalForSecret.__qqqqqqEphemeralSecret) {
    globalForSecret.__qqqqqqEphemeralSecret = crypto.getRandomValues(new Uint8Array(32));
  }
  return globalForSecret.__qqqqqqEphemeralSecret;
}

function getServerSupabase(requireServiceRole = false): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (requireServiceRole && process.env.VERCEL === '1' && !serviceRoleKey) {
    throw new Error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY must be configured.');
  }

  const key = serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) return null;

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}

async function getRateLimitKey(username: string): Promise<string> {
  let ip = 'local';
  try {
    const hdrs = await headers();
    const forwarded = hdrs.get('x-forwarded-for');
    if (forwarded) {
      ip = forwarded.split(',')[0]?.trim() || 'local';
    }
  } catch {
    ip = 'local';
  }
  return `${ip}:${username}`;
}

function pruneExpiredAttempts(now: number): void {
  for (const [k, entry] of authAttempts.entries()) {
    if (entry.resetAt <= now) {
      authAttempts.delete(k);
    }
  }
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  pruneExpiredAttempts(now);
  const entry = authAttempts.get(key);
  return Boolean(entry && entry.resetAt > now && entry.count >= MAX_AUTH_ATTEMPTS);
}

function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = authAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

async function issueSessionCookie(uid: string, username: string, isGuest: boolean): Promise<void> {
  const token = await new SignJWT({ uid, username, isGuest })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecretKey());

  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function loginOrganizer(username: string, passwordRaw: string) {
  const uname = username.trim().toLowerCase();
  if (uname.length < 3 || passwordRaw.length < 1) {
    return { error: 'Please enter a valid username and password.' };
  }

  const rlKey = await getRateLimitKey(uname);
  if (isRateLimited(rlKey)) {
    return { error: 'Too many authentication attempts. Please try again in a minute.' };
  }

  const supabase = getServerSupabase(true);
  if (!supabase) {
    return { error: 'Authentication service unavailable. Please try again.' };
  }

  const { data, error } = await supabase
    .from('organizers')
    .select('username, password')
    .eq('username', uname)
    .maybeSingle();

  if (error) {
    console.error('Organizer lookup failed:', error.message);
    return { error: 'Authentication service unavailable. Please try again.' };
  }

  if (!data) {
    recordFailedAttempt(rlKey);
    return { error: 'Invalid username or password.' };
  }

  const storedPassword = String(data.password ?? '');
  const isHash = storedPassword.startsWith('$2');
  let isValid = false;

  if (isHash) {
    isValid = await bcrypt.compare(passwordRaw, storedPassword);
  } else {
    isValid = storedPassword === passwordRaw;
    if (isValid) {
      const hashed = await bcrypt.hash(passwordRaw, 12);
      const { error: upgradeErr } = await supabase
        .from('organizers')
        .update({ password: hashed })
        .eq('username', uname);
      if (upgradeErr) {
        console.error('Password hash upgrade failed:', upgradeErr.message);
      }
    }
  }

  if (!isValid) {
    recordFailedAttempt(rlKey);
    return { error: 'Invalid username or password.' };
  }

  authAttempts.delete(rlKey);
  await issueSessionCookie(uname, uname, false);
  return { success: true, username: uname };
}

export async function registerOrganizer(username: string, passwordRaw: string) {
  const uname = username.trim().toLowerCase();
  if (
    uname.length < 3 ||
    uname.length > 32 ||
    !USERNAME_REGEX.test(uname) ||
    passwordRaw.length < 8
  ) {
    return {
      error:
        'Username must be 3–32 characters (letters, numbers, _, ., -, []) and password must be at least 8 characters.',
    };
  }

  const rlKey = await getRateLimitKey(uname);
  if (isRateLimited(rlKey)) {
    return { error: 'Too many authentication attempts. Please try again in a minute.' };
  }

  const supabase = getServerSupabase(true);
  if (!supabase) {
    return { error: 'Registration service unavailable. Please try again.' };
  }

  const { data: existing, error: lookupErr } = await supabase
    .from('organizers')
    .select('username')
    .eq('username', uname)
    .maybeSingle();

  if (lookupErr) {
    console.error('Organizer uniqueness check failed:', lookupErr.message);
    return { error: 'Registration service unavailable. Please try again.' };
  }

  if (existing) {
    recordFailedAttempt(rlKey);
    return { error: 'Username already exists. Please sign in instead.' };
  }

  const hashed = await bcrypt.hash(passwordRaw, 12);
  const { error: insertError } = await supabase
    .from('organizers')
    .insert([{ username: uname, password: hashed }]);

  if (insertError) {
    console.error('Organizer creation failed:', insertError.message);
    return { error: 'Unable to create organizer account. Please try again.' };
  }

  authAttempts.delete(rlKey);
  await issueSessionCookie(uname, uname, false);
  return { success: true, username: uname };
}

export async function loginGuestOrganizer(requestedGuestId?: string) {
  const guestId =
    requestedGuestId && GUEST_UID_REGEX.test(requestedGuestId)
      ? requestedGuestId
      : `guest_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;

  await issueSessionCookie(guestId, 'Guest Organizer', true);
  return { success: true, uid: guestId };
}

export async function logoutOrganizer() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
  return { success: true };
}

export async function getSession(): Promise<OrganizerJwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const uid =
      typeof payload.uid === 'string'
        ? payload.uid
        : typeof payload.username === 'string'
          ? payload.username
          : null;
    if (!uid) return null;
    return {
      uid,
      username: typeof payload.username === 'string' ? payload.username : uid,
      isGuest: payload.isGuest === true,
    };
  } catch {
    return null;
  }
}

async function resolveCallerUid(claimedOwnerUid?: string): Promise<string | null> {
  const sess = await getSession();
  if (sess?.uid) {
    if (claimedOwnerUid && sess.uid !== claimedOwnerUid) {
      if (GUEST_UID_REGEX.test(claimedOwnerUid)) {
        await issueSessionCookie(claimedOwnerUid, 'Guest Organizer', true);
        return claimedOwnerUid;
      }
      return sess.uid;
    }
    return sess.uid;
  }

  if (claimedOwnerUid && GUEST_UID_REGEX.test(claimedOwnerUid)) {
    await issueSessionCookie(claimedOwnerUid, 'Guest Organizer', true);
    return claimedOwnerUid;
  }

  return null;
}

export async function upsertSessionAction(input: {
  id: string;
  joinCode: string;
  ownerUid: string;
  isActive: boolean;
  stateJson: CloudSessionStateJson;
}): Promise<{ success?: boolean; error?: string }> {
  const callerUid = await resolveCallerUid(input.ownerUid);
  if (!callerUid || callerUid !== input.ownerUid) {
    return { error: 'Unauthorized organizer session.' };
  }

  const supabase = getServerSupabase(true);
  if (!supabase) return { error: 'Cloud database unavailable.' };

  const { data: existing, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, owner_uid')
    .eq('id', input.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('Session ownership lookup failed:', fetchErr.message);
    return { error: 'Cloud Sync Error: unable to verify session ownership.' };
  }

  if (existing && existing.owner_uid !== callerUid) {
    return { error: 'Forbidden: session belongs to another organizer.' };
  }

  const { error } = await supabase.from('sessions').upsert({
    id: input.id,
    join_code: input.joinCode,
    owner_uid: callerUid,
    is_active: input.isActive,
    state_json: input.stateJson,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Supabase upsert failed:', error.message);
    return { error: 'Cloud Sync Error: unable to save session state.' };
  }

  return { success: true };
}

export async function endSessionAction(
  sessionId: string,
  finalStateJson: CloudSessionStateJson,
  claimedOwnerUid?: string
): Promise<{ success?: boolean; error?: string }> {
  const callerUid = await resolveCallerUid(claimedOwnerUid);
  if (!callerUid) {
    return { error: 'Unauthorized organizer session.' };
  }

  const supabase = getServerSupabase(true);
  if (!supabase) return { error: 'Cloud database unavailable.' };

  const { data: existing, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, owner_uid')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchErr) {
    console.error('Session end lookup failed:', fetchErr.message);
    return { error: 'Failed to end cloud session.' };
  }

  if (existing && existing.owner_uid !== callerUid) {
    return { error: 'Forbidden: you do not own this session.' };
  }

  const { error } = await supabase
    .from('sessions')
    .update({
      is_active: false,
      state_json: finalStateJson,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('owner_uid', callerUid);

  if (error) {
    console.error('Failed to broadcast session end:', error.message);
    return { error: 'Failed to end cloud session.' };
  }

  return { success: true };
}

export async function deleteSessionAction(
  sessionId: string,
  claimedOwnerUid?: string
): Promise<{ success?: boolean; error?: string }> {
  const callerUid = await resolveCallerUid(claimedOwnerUid);
  if (!callerUid) {
    return { error: 'Unauthorized organizer session.' };
  }

  const supabase = getServerSupabase(true);
  if (!supabase) return { error: 'Cloud database unavailable.' };

  const { data: existing, error: lookupErr } = await supabase
    .from('sessions')
    .select('id, owner_uid')
    .eq('id', sessionId)
    .maybeSingle();

  if (lookupErr) {
    console.error('Session delete lookup failed:', lookupErr.message);
    return { error: 'Failed to delete session from cloud.' };
  }

  if (!existing) {
    return { success: true };
  }

  if (existing.owner_uid !== callerUid) {
    return { error: 'Forbidden: you do not own this session.' };
  }

  const { data: deleted, error: delErr } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId)
    .eq('owner_uid', callerUid)
    .select('id');

  if (!delErr && Array.isArray(deleted) && deleted.length > 0) {
    return { success: true };
  }

  // Fallback when RLS silently blocks hard DELETE without service role key:
  // mark row cleanly tombstoned under an atomic update owned by callerUid.
  const { data: tombstoned, error: tombErr } = await supabase
    .from('sessions')
    .update({
      is_active: false,
      owner_uid: '__deleted__',
      state_json: {
        session: { id: sessionId, isActive: false, deleted: true },
        players: [],
        courts: [],
        matches: [],
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('owner_uid', callerUid)
    .select('id');

  if (tombErr || !Array.isArray(tombstoned) || tombstoned.length === 0) {
    console.error('Session delete & tombstone both failed:', delErr?.message || tombErr?.message);
    return { error: 'Failed to delete session from cloud.' };
  }

  return { success: true };
}

export async function fetchDashboardSessionAction(
  sessionId: string,
  claimedOwnerUid?: string
): Promise<
  | { status: 'ok'; row: CloudSessionRow }
  | { status: 'ended'; id: string }
  | { status: 'not_found' }
  | { status: 'forbidden' }
> {
  const supabase = getServerSupabase(true);
  if (!supabase) return { status: 'not_found' };

  const { data, error } = await supabase
    .from('sessions')
    .select('id, join_code, owner_uid, is_active, updated_at, state_json')
    .eq('id', sessionId)
    .maybeSingle<CloudSessionRow>();

  if (error) {
    console.error('Dashboard session fetch failed:', error.message);
    return { status: 'not_found' };
  }

  if (
    !data ||
    !data.state_json ||
    data.owner_uid === '__deleted__' ||
    data.state_json?.session?.deleted
  ) {
    return { status: 'not_found' };
  }

  if (!data.is_active) {
    return { status: 'ended', id: data.id };
  }

  const callerUid = await resolveCallerUid(claimedOwnerUid);
  if (!callerUid || data.owner_uid !== callerUid) {
    return { status: 'forbidden' };
  }

  return { status: 'ok', row: data };
}

export async function fetchOwnerSessionsAction(
  claimedOwnerUid?: string,
  limit = 25,
  offset = 0
): Promise<{ sessions: CloudSessionRow[]; hasMore: boolean; error?: string }> {
  const callerUid = await resolveCallerUid(claimedOwnerUid);
  if (!callerUid || (claimedOwnerUid && callerUid !== claimedOwnerUid)) {
    return { sessions: [], hasMore: false };
  }

  const supabase = getServerSupabase(true);
  if (!supabase) {
    return { sessions: [], hasMore: false, error: 'Cloud database unavailable.' };
  }

  const safeLimit = Math.max(1, Math.min(100, limit));
  const safeOffset = Math.max(0, offset);

  const { data, error } = await supabase
    .from('sessions')
    .select('id, join_code, owner_uid, is_active, updated_at, state_json')
    .eq('owner_uid', callerUid)
    .order('updated_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit)
    .returns<CloudSessionRow[]>();

  if (error) {
    console.error('Owner sessions query failed:', error.message);
    return { sessions: [], hasMore: false, error: 'Failed to load sessions.' };
  }

  const rows = Array.isArray(data) ? data : [];
  const hasMore = rows.length > safeLimit;
  return {
    sessions: hasMore ? rows.slice(0, safeLimit) : rows,
    hasMore,
  };
}
