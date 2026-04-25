const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
let supabaseUrl = '';
let supabaseKey = '';

envContent.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
});

async function checkLatest() {
  const url = supabaseUrl + '/rest/v1/stories?order=created_at.desc&limit=1';
  const res = await fetch(url, { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } });
  const stories = await res.json();
  
  if (stories.length === 0) return console.log('No stories found');
  const storyId = stories[0].id;
  
  const scenesUrl = supabaseUrl + `/rest/v1/scenes?story_id=eq.${storyId}&order=scene_number.asc`;
  const scenesRes = await fetch(scenesUrl, { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } });
  const scenes = await scenesRes.json();
  
  console.log('Latest Story ID:', storyId);
  console.log('Latest Story Title:', stories[0].title);
  console.log('Status:', stories[0].status);
  console.log('Total Scenes:', scenes.length);
  const statuses = scenes.reduce((acc, s) => {
    acc[s.image_status] = (acc[s.image_status] || 0) + 1;
    return acc;
  }, {});
  console.log('Image Statuses:', statuses);

  const failedScenes = scenes.filter(s => s.image_status === 'failed');
  if (failedScenes.length > 0) {
    console.log('\nFailed scenes details:');
    failedScenes.slice(0, 3).forEach(s => {
      console.log(`Scene ${s.scene_number}:`);
      console.log(`Prompt: ${s.image_prompt}`);
      console.log('---');
    });
  }
}

checkLatest();
