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
      console.warn("No refresh token received from Google. You may need to revoke app access in Google settings and try again.");
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

    if (tokens.refresh_token) {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ 
          user_id: user.id, 
          youtube_refresh_token: tokens.refresh_token 
        });

      if (error) throw error;
    }

    // Redirect back to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error: any) {
    console.error('Error exchanging token:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
