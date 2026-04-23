const text = `
SCENE 1:
A lone figure walks through a desolate wasteland, the sky above a swirling vortex of crimson and obsidian clouds. The ground is cracked and dry, whispering tales of a forgotten era. In the distance, a faint, pulsing light beckons like a beacon of hope amidst the despair.

IMAGE_PROMPT 1:
A wide shot of a desolate, cracked wasteland under a dramatic sky with swirling crimson and obsidian clouds. A tiny, solitary figure walks towards a faint, glowing light in the distance. Cinematic lighting, high contrast, moody atmosphere, highly detailed, concept art, 16:9 aspect ratio.

SCENE 2:
The figure reaches the source of the light, revealing a monolithic structure of smooth, dark metal. Runes etched into its surface begin to glow, pulsating in rhythm with the figure's heartbeat. As they place a hand on the cold metal, a surge of energy courses through them, awakening dormant memories.

IMAGE_PROMPT 2:
A close-up of a lone figure placing their hand on a massive, dark metallic monolith. The surface is covered in glowing runes that pulse with energy. The atmosphere is mystical and ancient. Cinematic lighting, glowing effects, highly detailed, concept art, 16:9 aspect ratio.

SCENE 3:
Flashbacks flood their mind: a vibrant city, laughter, and a cataclysmic event that shattered the world. They realize they are not just a survivor, but a guardian tasked with restoring balance. With newfound purpose, they turn back, ready to face the encroaching darkness.

IMAGE_PROMPT 3:
A dual-composition image: one side shows a vibrant, futuristic city full of life and light, while the other side shows a cataclysmic explosion shattering the city into ruins. The style is surreal and dreamlike, with vibrant colors contrasting with dark destruction. Cinematic, highly detailed, 16:9 aspect ratio.

SCENE 4:
The wasteland begins to shift, monstrous shapes emerging from the shadows, drawn to the monolith's awakened energy. The guardian stands firm, summoning a brilliant blade of light that cuts through the gloom. The battle for the future has begun, and they will not yield.

IMAGE_PROMPT 4:
An action-packed scene of a guardian wielding a brilliant, glowing blade of light, standing defiantly against shadowy, monstrous figures emerging from the dark wasteland. Dramatic combat lighting, intense energy, dynamic composition, highly detailed, 16:9 aspect ratio.

SCENE 5:
As the last of the shadows dissipates, the sky clears, revealing a dawn of breathtaking beauty. The monolith hums with a gentle, golden light, signaling the rebirth of the world. The guardian smiles, knowing their journey is just beginning.

IMAGE_PROMPT 5:
A breathtaking sunrise over a newly healed landscape, with a towering, dark metallic monolith glowing gently with golden light. A lone figure stands in the foreground, watching the dawn. Cinematic lighting, serene atmosphere, beautiful colors, highly detailed, 16:9 aspect ratio.
`

function parseScenes(text) {
  const scenes = [];

  const sceneRegex = /SCENE\s+(\d+):\s*([\s\S]*?)(?=IMAGE_PROMPT\s+\1:|$)/gi;
  const imagePromptRegex = /IMAGE_PROMPT\s+(\d+):\s*([\s\S]*?)(?=SCENE\s+\d+:|$)/gi;

  const sceneMatches = Array.from(text.matchAll(sceneRegex));
  const imagePromptMatches = Array.from(text.matchAll(imagePromptRegex));

  for (let i = 0; i < Math.min(sceneMatches.length, imagePromptMatches.length); i++) {
    const script = sceneMatches[i][2].trim();
    const imagePrompt = imagePromptMatches[i][2].trim();

    if (script && imagePrompt) {
      scenes.push({ script, imagePrompt });
    }
  }

  return scenes;
}

console.log(parseScenes(text));
