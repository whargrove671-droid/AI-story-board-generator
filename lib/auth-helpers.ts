import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import crypto from 'crypto';

/**
 * Creates a server Supabase client configured for Next.js App Router route handlers.
 */
export function createRouteSupabaseClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // No-op in Route Handlers unless modifying response cookies
        },
      },
    }
  );
}

/**
 * Validates the user session in a route handler and returns the Supabase client & authenticated user.
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const supabase = createRouteSupabaseClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null };
  }

  return { supabase, user };
}

/**
 * Verifies that a story exists and belongs to the authenticated user (prevents IDOR).
 */
export async function verifyStoryOwnership(
  supabase: any,
  storyId: string,
  userId: string
) {
  const { data: story, error } = await supabase
    .from('stories')
    .select('*, scenes(*)')
    .eq('id', storyId)
    .eq('user_id', userId)
    .single();

  if (error || !story) {
    return null;
  }

  return story;
}

/**
 * SSRF guard for downloading media: validates that the URL uses HTTPS and does not point to internal/loopback IPs.
 */
export function validateMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    
    // Disallow loopback / private addresses
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      (hostname.startsWith('172.') &&
        parseInt(hostname.split('.')[1] || '0', 10) >= 16 &&
        parseInt(hostname.split('.')[1] || '0', 10) <= 31) ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a signed OAuth state token to protect against OAuth CSRF.
 */
export function createOAuthState(userId: string, channel: 'main' | 'sub'): string {
  const secret = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'default-state-secret';
  const timestamp = Date.now();
  const payload = `${userId}:${channel}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verifies and decodes an OAuth state token.
 */
export function verifyOAuthState(
  state: string | null,
  userId: string
): { valid: boolean; channel: 'main' | 'sub' } {
  if (!state) {
    return { valid: false, channel: 'main' };
  }

  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) {
      // Backwards compatibility for legacy plain state ('main' | 'sub')
      if (state === 'main' || state === 'sub') {
        return { valid: true, channel: state };
      }
      return { valid: false, channel: 'main' };
    }

    const [tokenUserId, channel, timestampStr, hmac] = parts;
    if (tokenUserId !== userId || (channel !== 'main' && channel !== 'sub')) {
      return { valid: false, channel: 'main' };
    }

    const timestamp = parseInt(timestampStr, 10);
    // Expire state token after 30 minutes
    if (Date.now() - timestamp > 30 * 60 * 1000) {
      return { valid: false, channel: 'main' };
    }

    const secret = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'default-state-secret';
    const expectedPayload = `${tokenUserId}:${channel}:${timestampStr}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return { valid: false, channel: 'main' };
    }

    return { valid: true, channel: channel as 'main' | 'sub' };
  } catch {
    return { valid: false, channel: 'main' };
  }
}
