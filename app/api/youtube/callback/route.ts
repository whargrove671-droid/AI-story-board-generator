import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/youtube/callback`
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // We strictly need the refresh token to upload videos in the background later
    if (!tokens.refresh_token) {
      console.warn("No refresh token received from Google.");
      return new NextResponse(
        `<html><body>
          <h2>Authentication Error</h2>
          <p>Google did not provide a refresh token. This usually happens if you've already authorized the app previously.</p>
          <p>To fix this and select your Sub Channel:</p>
          <ol>
            <li>Go to <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a></li>
            <li>Find this app in the list and click "Remove Access"</li>
            <li>Come back to the dashboard and try connecting your Sub Channel again.</li>
          </ol>
          <a href="/dashboard">Return to Dashboard</a>
        </body></html>`,
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Save refresh token to user_settings
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Read-only in this context
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const state = searchParams.get('state') || 'main';

    if (tokens.refresh_token) {
      const updateData: any = { user_id: user.id };
      
      if (state === 'sub') {
        updateData.youtube_sub_refresh_token = tokens.refresh_token;
      } else {
        updateData.youtube_refresh_token = tokens.refresh_token;
      }

      const { error } = await supabase
        .from('user_settings')
        .upsert(updateData);

      if (error) throw error;
    }

    // Redirect back to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error: any) {
    console.error('Error exchanging token:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
