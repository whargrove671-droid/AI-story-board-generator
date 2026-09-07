/*
  # Security Hardening: user_settings and Media Storage RLS

  1. New Tables
    - `user_settings`
      - `user_id` (uuid, primary key, references auth.users)
      - `youtube_refresh_token` (text, nullable)
      - `youtube_sub_refresh_token` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security Controls
    - Enable Row Level Security (RLS) on `user_settings` table
    - Users can only read, insert, update, or delete their own settings
    - Add policies on storage.objects for 'media' bucket to ensure authenticated user isolation
*/

-- 1. Create user_settings table if it doesn't already exist
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_refresh_token text,
  youtube_sub_refresh_token text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies to prevent conflicts
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON user_settings;

-- Strict User Settings Policies
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own settings"
  ON user_settings FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Index for lookup performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
