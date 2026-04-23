require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkScenes() {
  const { data, error } = await supabase
    .from('scenes')
    .select('id, story_id, image_status, scene_number')
    .neq('image_status', 'completed');
  
  if (error) {
    console.error('Error fetching scenes:', error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
checkScenes();
