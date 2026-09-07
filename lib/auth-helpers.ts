import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import crypto from 'crypto';
import fs from 'fs';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

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
 * SSRF guard for downloading media: validates HTTPS protocol, approved domains,
 * and explicitly blocks internal/loopback/cloud-metadata addresses.
 */
export function validateMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    // Disallow non-HTTPS schemes (no file://, gopher://, http://, etc.)
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Disallow cloud metadata services, link-local, and loopback addresses
    if (
      hostname === '169.254.169.254' ||
      hostname.startsWith('169.254.') ||
      hostname === 'metadata.google.internal' ||
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
      hostname.endsWith('.local') ||
      hostname.endsWith('.nip.io') ||
      hostname.endsWith('.localtest.me')
    ) {
      return false;
    }

    // Match against approved domains
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase()
      : null;

    const allowedDomains = [
      'supabase.co',
      'together.xyz',
      'openai.com',
      'oaidalleapiprodscus.blob.core.windows.net',
      'blob.core.windows.net',
      'youtube.com',
      'ytimg.com',
      'googlevideo.com',
    ];

    if (supabaseHost && (hostname === supabaseHost || hostname.endsWith('.' + supabaseHost))) {
      return true;
    }

    const isAllowed = allowedDomains.some(
      (d) => hostname === d || hostname.endsWith('.' + d)
    );

    return isAllowed;
  } catch {
    return false;
  }
}

/**
 * Safely downloads a file from a URL with SSRF protection, manual redirect inspection,
 * and streaming size bounds to prevent memory/disk exhaustion.
 */
export async function safeDownloadFile(
  url: string,
  outputPath: string,
  maxBytes: number = 50 * 1024 * 1024 // 50MB default limit
): Promise<void> {
  if (!validateMediaUrl(url)) {
    throw new Error(`Invalid or disallowed media URL: ${url}`);
  }

  let currentUrl = url;
  let redirectCount = 0;
  const maxRedirects = 3;
  let response: Response | null = null;

  while (redirectCount <= maxRedirects) {
    response = await fetch(currentUrl, {
      redirect: 'manual',
    });

    // Manually handle redirects to prevent SSRF redirect bypass
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect response missing Location header');
      }

      const resolvedRedirect = new URL(location, currentUrl).toString();
      if (!validateMediaUrl(resolvedRedirect)) {
        throw new Error(`Disallowed redirect target URL: ${resolvedRedirect}`);
      }

      currentUrl = resolvedRedirect;
      redirectCount++;
      continue;
    }

    break;
  }

  if (!response || !response.ok) {
    throw new Error(`Failed to fetch media from ${currentUrl}: ${response?.statusText || 'Unknown Error'}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new Error(`Media file exceeds maximum allowed size of ${maxBytes} bytes`);
  }

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  let bytesReceived = 0;
  const fileStream = fs.createWriteStream(outputPath);
  const nodeStream = Readable.fromWeb(response.body as any);

  const countingStream = new Transform({
    transform(chunk, encoding, callback) {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        callback(new Error(`Download exceeded maximum limit of ${maxBytes} bytes`));
      } else {
        callback(null, chunk);
      }
    },
  });

  try {
    await pipeline(nodeStream, countingStream, fileStream);
  } catch (err) {
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch {}
    throw err;
  }
}

/**
 * Returns the server-side private secret for signing OAuth state tokens.
 * NEVER falls back to NEXT_PUBLIC_* variables.
 */
function getOAuthStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secret) return secret;
  // Fallback to internal server-side secret
  return process.env.OPENAI_API_KEY || 'internal-secure-state-secret-story-gen';
}

/**
 * Generates a signed OAuth state token to protect against OAuth CSRF.
 * Includes user ID, target channel, timestamp, and a cryptographically secure random nonce.
 */
export function createOAuthState(userId: string, channel: 'main' | 'sub'): string {
  const secret = getOAuthStateSecret();
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${userId}:${channel}:${timestamp}:${nonce}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verifies and decodes an OAuth state token.
 * Rejects expired tokens, mismatched users, and any legacy unauthenticated tokens.
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
    
    // Format: userId:channel:timestamp:nonce:hmac
    if (parts.length !== 5) {
      return { valid: false, channel: 'main' };
    }

    const [tokenUserId, channel, timestampStr, nonce, hmac] = parts;
    if (tokenUserId !== userId || (channel !== 'main' && channel !== 'sub')) {
      return { valid: false, channel: 'main' };
    }

    const timestamp = parseInt(timestampStr, 10);
    // Expire state token after 15 minutes (or reject future-dated timestamps)
    if (isNaN(timestamp) || Date.now() - timestamp > 15 * 60 * 1000 || timestamp > Date.now() + 60000) {
      return { valid: false, channel: 'main' };
    }

    const secret = getOAuthStateSecret();
    const expectedPayload = `${tokenUserId}:${channel}:${timestampStr}:${nonce}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return { valid: false, channel: 'main' };
    }

    return { valid: true, channel: channel as 'main' | 'sub' };
  } catch {
    return { valid: false, channel: 'main' };
  }
}
