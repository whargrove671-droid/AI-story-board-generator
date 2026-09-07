import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('youtube_refresh_token, youtube_sub_refresh_token')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "Results contain 0 rows", which is expected for new users
      console.error('Error fetching user settings:', error);
    }

    return NextResponse.json({
      mainConnected: Boolean(settings?.youtube_refresh_token),
      subConnected: Boolean(settings?.youtube_sub_refresh_token),
    });
  } catch (error: any) {
    console.error('YouTube status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check YouTube connection status' },
      { status: 500 }
    );
  }
}
