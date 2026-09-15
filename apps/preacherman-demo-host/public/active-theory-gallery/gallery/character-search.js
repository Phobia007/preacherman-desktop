// Aliases only affect matching; displayed names come from the character catalog.
const aliases = {
  "secret-sky": ["Cortana", "科塔娜", "可塔娜"],
  "watson-masters": ["Zima", "Zima Blue", "齐马"],
  "climatune": ["Jubilee", "李千欢"],
  "eye-of-the-stormers": ["Master Chief", "John 117", "士官长"],
  "bon-iver-viisualiizer": ["Kitana", "吉塔娜"],
  "classic-stories-retold": ["Magik", "Illyana Rasputin", "秘客", "魔剑客"],
  "mastered-from-chaos": ["Clove"],
  "emmit-fenn": ["2B", "YoRHa No.2 Type B"],
  "spacecraft-for-all": ["Lily", "莉莉"],
  "i-will-what-i-want": ["Iron Man", "Tony Stark", "钢铁侠"],
  "acoustic-garage": ["The Twins", "Twins", "双生舞伶"],
  "witness-gotham": ["Noble Six", "Noble 6", "SPARTAN B312"],
  "toonami": ["Michael Myers", "迈克尔迈尔斯"],
  "halo-5-visualizer": ["Pathfinder", "探路者"],
};

function normalize(value) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/\b(?:models?|characters?)\b/g, "")
    .replace(/(?:的)?(?:模型|角色)/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function findGalleryCharacter(cards, value) {
  const query = normalize(value.trim());
  if (!query) return null;
  let best = null, bestScore = 0;
  for (const card of cards) {
    if (!aliases[card.id]) continue;
    const names = [card.title, ...(aliases[card.id] || [])].map(normalize);
    const score = Math.max(...names.map(name => name === query ? 3 : name.startsWith(query) ? 2 : name.includes(query) ? 1 : 0));
    if (score > bestScore) { best = card; bestScore = score; }
  }
  return best;
}
