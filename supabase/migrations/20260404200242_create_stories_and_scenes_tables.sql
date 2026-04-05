/*
  # Create Stories and Scenes Tables

  ## New Tables
  
  ### `stories`
  - `id` (uuid, primary key) - Unique identifier for each story
  - `user_id` (uuid, foreign key) - References auth.users(id)
  - `title` (text) - Story title/idea
  - `description` (text, nullable) - Optional story description
  - `status` (text) - Generation status: 'pending', 'generating', 'completed', 'failed'
  - `created_at` (timestamptz) - When the story was created
  - `updated_at` (timestamptz) - When the story was last updated
  
  ### `scenes`
  - `id` (uuid, primary key) - Unique identifier for each scene
  - `story_id` (uuid, foreign key) - References stories(id)
  - `scene_number` (integer) - Scene order (1-5)
  - `script` (text) - Generated scene script
  - `image_prompt` (text) - Image generation prompt
  - `image_url` (text, nullable) - Generated image URL
  - `image_status` (text) - Image generation status: 'pending', 'generating', 'completed', 'failed'
  - `created_at` (timestamptz) - When the scene was created
  - `updated_at` (timestamptz) - When the scene was last updated

  ## Security
  - Enable RLS on all tables
  - Users can only read/write their own stories and scenes
  - Cascade delete scenes when story is deleted
*/

-- Create stories table
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create scenes table
CREATE TABLE IF NOT EXISTS scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  script text NOT NULL,
  image_prompt text NOT NULL,
  image_url text,
  image_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT scenes_scene_number_check CHECK (scene_number >= 1 AND scene_number <= 5)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenes_story_id ON scenes(story_id);
CREATE INDEX IF NOT EXISTS idx_scenes_scene_number ON scenes(story_id, scene_number);

-- Enable Row Level Security
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

-- Stories policies
CREATE POLICY "Users can view own stories"
  ON stories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stories"
  ON stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stories"
  ON stories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
  ON stories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Scenes policies
CREATE POLICY "Users can view own scenes"
  ON scenes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own scenes"
  ON scenes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own scenes"
  ON scenes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own scenes"
  ON scenes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = scenes.story_id
      AND stories.user_id = auth.uid()
    )
  );