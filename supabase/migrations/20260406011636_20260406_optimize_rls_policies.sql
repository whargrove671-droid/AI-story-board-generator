/*
  # Optimize RLS Policies for Performance

  ## Changes
  - Replace direct `auth.uid()` calls with `(select auth.uid())` in all RLS policies
  - This prevents re-evaluation of auth functions for each row
  - Improves query performance at scale
  - Remove unused indexes to reduce maintenance overhead

  ## Tables Modified
  - `stories`: 4 policies updated
  - `scenes`: 4 policies updated and 4 indexes removed

  ## Security Impact
  - No security changes - policies remain equally restrictive
  - Performance improvement only
*/

-- Drop old policies on stories table
DROP POLICY IF EXISTS "Users can view own stories" ON stories;
DROP POLICY IF EXISTS "Users can insert own stories" ON stories;
DROP POLICY IF EXISTS "Users can update own stories" ON stories;
DROP POLICY IF EXISTS "Users can delete own stories" ON stories;

-- Recreate optimized stories policies
CREATE POLICY "Users can view own stories"
  ON stories FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own stories"
  ON stories FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own stories"
  ON stories FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own stories"
  ON stories FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Drop old policies on scenes table
DROP POLICY IF EXISTS "Users can view own scenes" ON scenes;
DROP POLICY IF EXISTS "Users can insert own scenes" ON scenes;
DROP POLICY IF EXISTS "Users can update own scenes" ON scenes;
DROP POLICY IF EXISTS "Users can delete own scenes" ON scenes;

-- Recreate optimized scenes policies
CREATE POLICY "Users can view own scenes"
  ON scenes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert own scenes"
  ON scenes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update own scenes"
  ON scenes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete own scenes"
  ON scenes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = (select auth.uid())
    )
  );

-- Drop unused indexes
DROP INDEX IF EXISTS idx_stories_user_id;
DROP INDEX IF EXISTS idx_stories_created_at;
DROP INDEX IF EXISTS idx_scenes_story_id;
DROP INDEX IF EXISTS idx_scenes_scene_number;
