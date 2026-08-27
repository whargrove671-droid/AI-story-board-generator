import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedUser, createOAuthState } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/youtube/callback`
    );

    const searchParams = request.nextUrl.searchParams;
    const channelParam = searchParams.get('channel');
    const channel: 'main' | 'sub' = channelParam === 'sub' ? 'sub' : 'main';

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ];

    // Generate signed state parameter tied to user ID to prevent OAuth CSRF
    const signedState = createOAuthState(user.id, channel);

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent select_account',
      state: signedState,
    });

    return NextResponse.redirect(url);
  } catch (error: any) {
    console.error('YouTube Auth Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate YouTube auth URL. Check your GOOGLE_CLIENT_ID configuration.' },
      { status: 500 }
    );
  }
}
