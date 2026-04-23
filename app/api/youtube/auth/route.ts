import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/youtube/callback`
);

export async function GET(request: NextRequest) {
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
    prompt: 'consent'
  });

  return NextResponse.redirect(url);
}
