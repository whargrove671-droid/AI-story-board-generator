import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

// removed global oauth2Client to ensure it re-reads environment variables on each request

export async function GET(request: NextRequest) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/youtube/callback`
    );

    const searchParams = request.nextUrl.searchParams;
    const channel = searchParams.get('channel') || 'main'; // 'main' or 'sub'

    // Generate a url that asks permissions for YouTube upload
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload'
    ];

    const url = oauth2Client.generateAuthUrl({
      // 'online' (default) or 'offline' (gets refresh_token)
      access_type: 'offline',
      // If you only need one scope you can pass it as a string
      scope: scopes,
      // Force prompt to ensure we always get a refresh token
      prompt: 'consent',
      // Pass channel type as state to remember it in the callback
      state: channel,
    });

    return NextResponse.redirect(url);
  } catch (error: any) {
    console.error('YouTube Auth Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate YouTube auth URL. Check your GOOGLE_CLIENT_ID in .env.local' }, { status: 500 });
  }
}
