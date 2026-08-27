import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedUser, verifyOAuthState } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const rawState = searchParams.get('state');

  if (!code) {
    return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
  }

  const { supabase, user } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Validate signed state to prevent OAuth CSRF
  const { valid, channel: state } = verifyOAuthState(rawState, user.id);
  if (!valid) {
    return new NextResponse(
      `<html><body style="background:#000;color:#f00;font-family:monospace;padding:40px;">
        <h2 style="color:#f55;">SYS.ERR: INVALID_OR_EXPIRED_OAUTH_STATE</h2>
        <p style="color:#ccc;">The authentication session was invalid or has expired. Please try connecting your channel again from the dashboard.</p>
        <br/>
        <a href="/dashboard" style="color:#0ff;text-decoration:none;border:1px solid #0ff;padding:10px 20px;display:inline-block;margin-top:20px;">RETURN TO DASHBOARD</a>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/youtube/callback`
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      console.warn("No refresh token received from Google.");
      return new NextResponse(
        `<html><body style="background:#000;color:#f00;font-family:monospace;padding:40px;">
          <h2 style="color:#f55;">Authentication Error</h2>
          <p style="color:#ccc;">Google did not provide a refresh token. This usually happens if you've already authorized the app previously.</p>
          <p style="color:#ccc;">To fix this and select your Sub Channel:</p>
          <ol style="color:#ccc;">
            <li>Go to <a href="https://myaccount.google.com/permissions" target="_blank" style="color:#0ff;">Google Account Permissions</a></li>
            <li>Find this app in the list and click "Remove Access"</li>
            <li>Come back to the dashboard and try connecting your Sub Channel again.</li>
          </ol>
          <br/>
          <a href="/dashboard" style="color:#0ff;text-decoration:none;border:1px solid #0ff;padding:10px 20px;display:inline-block;margin-top:20px;">RETURN TO DASHBOARD</a>
        </body></html>`,
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    if (tokens.refresh_token) {
      oauth2Client.setCredentials(tokens);
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      
      let newChannelId: string | null = null;
      let newChannelName: string | null = null;
      try {
        const channelRes = await youtube.channels.list({ part: ['id', 'snippet'], mine: true });
        newChannelId = channelRes.data.items?.[0]?.id || null;
        newChannelName = channelRes.data.items?.[0]?.snippet?.title || 'Unknown Channel';
      } catch (e) {
        console.error("Failed to get new channel ID", e);
      }

      const { data: existingSettings } = await supabase
        .from('user_settings')
        .select('youtube_refresh_token, youtube_sub_refresh_token')
        .eq('user_id', user.id)
        .single();

      if (newChannelId && existingSettings) {
        let compareToken: string | null = null;
        if (state === 'sub') compareToken = existingSettings.youtube_refresh_token;
        if (state === 'main') compareToken = existingSettings.youtube_sub_refresh_token;

        if (compareToken) {
          const checkAuth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
          checkAuth.setCredentials({ refresh_token: compareToken });
          const checkYoutube = google.youtube({ version: 'v3', auth: checkAuth });
          
          let existingChannelId: string | null = null;
          try {
            const checkRes = await checkYoutube.channels.list({ part: ['id'], mine: true });
            existingChannelId = checkRes.data.items?.[0]?.id || null;
          } catch (e) {
            console.error("Failed to get existing channel ID", e);
          }

          if (existingChannelId && newChannelId === existingChannelId) {
            return new NextResponse(
              `<html><body style="background:#000;color:#f00;font-family:monospace;padding:40px;">
                <h2 style="color:#f55;">SYS.ERR: CHANNEL DUPLICATION DETECTED</h2>
                <p style="color:#ccc;">You attempted to connect <b>${newChannelName}</b>, but this channel is ALREADY connected as your ${state === 'sub' ? 'Main' : 'Sub'} Channel!</p>
                <p style="color:#ccc;">When Google asks you to <b>"Choose an account or a brand account"</b>, you must select a DIFFERENT YouTube channel (Brand Account).</p>
                <p style="color:#ccc;">Please go back and try again. Make sure you click on the correct channel.</p>
                <br/>
                <a href="/dashboard" style="color:#0ff;text-decoration:none;border:1px solid #0ff;padding:10px 20px;display:inline-block;margin-top:20px;">RETURN TO DASHBOARD</a>
              </body></html>`,
              { status: 400, headers: { 'Content-Type': 'text/html' } }
            );
          }
        }
      }

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

    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error: any) {
    console.error('Error exchanging token:', error);
    return NextResponse.json({ error: error.message || 'Failed to exchange token' }, { status: 500 });
  }
}
