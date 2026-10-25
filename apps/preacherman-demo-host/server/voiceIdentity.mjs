import characters from "../src/surfaces/asset/characters.json" with { type: "json" };

const normalize = value => typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") : "";
const aliases = characters.flatMap(character => [...new Set([character.id, character.name, character.label].map(normalize))].map(alias => [alias, character.id])).sort((a, b) => b[0].length - a[0].length);
const variantSuffix = /^(?:(?:voice|preview|clone|english|chinese|mandarin|zhcn|zhtw|enus|engb|en|zh|cn|中文|英文)|v\d+)*$/;

function characterId(voice) {
  const explicit = voice.metadata?.characterId;
  const name = normalize(explicit || voice.id);
  if (!name) return null;
  const exact = aliases.find(([alias]) => name === alias);
  if (exact) return exact[1];
  // Explicit assignments must name a known character; never guess from prose.
  if (explicit) return null;
  return aliases.find(([alias]) => name.startsWith(alias) && variantSuffix.test(name.slice(alias.length)))?.[1] || null;
}

function metadataLanguage(value) {
  const language = normalize(value);
  if (["zh", "cn", "zhcn", "zhtw", "chinese", "mandarin", "中文", "汉语", "普通话"].includes(language)) return "zh";
  if (["en", "enus", "engb", "english", "英文", "英语"].includes(language)) return "en";
  return "unknown";
}

const timestamp = /^\s*(?:\d+[.)、]\s*)?\[\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[–—-]|-->)\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\]\s*/;
const annotation = /^(?:\[[^\]]*\]|〔[^〕]*〕|（[^）]*）|\([^)]*\))$/;
const heading = /^(?:来源|对应音频|音频时长|截取范围|范围|说明|整理依据|词句核对参考|文字稿|source|audio file|duration|transcript|note|reference)\s*[:：]/i;
const englishWords = /\b(?:a|the|i|you|we|he|she|it|they|my|your|our|is|am|are|was|were|this|that|these|those|to|of|and|for|with|hello|hi|welcome|maybe|thanks|thank|please)\b/i;

function spokenLanguage(line) {
  const han = line.match(/\p{Script=Han}/gu)?.length || 0;
  const latin = line.match(/[a-z]/gi)?.length || 0;
  if (han >= 2) return englishWords.test(line) && latin > han * 2 ? "unknown" : "zh";
  return han === 0 && englishWords.test(line) ? "en" : "unknown";
}

function referenceLanguage(text) {
  if (typeof text !== "string" || !text.trim()) return "unknown";
  const lines = text.replace(/\r/g, "").split("\n").map(line => line.trim());
  const timestamped = lines.some(line => timestamp.test(line));
  const utterances = [];
  let awaitingDialogue = !timestamped;
  for (const line of lines) {
    if (timestamp.test(line)) {
      awaitingDialogue = true;
      const inline = line.replace(timestamp, "").trim();
      if (inline && !annotation.test(inline)) { utterances.push(inline); awaitingDialogue = false; }
    } else if (awaitingDialogue && line && !annotation.test(line) && !heading.test(line)) {
      utterances.push(line);
      // A following translation is documentation, not evidence of a second spoken language.
      if (timestamped) awaitingDialogue = false;
    }
  }
  const detected = new Set(utterances.map(spokenLanguage).filter(language => language !== "unknown"));
  return detected.size === 1 ? [...detected][0] : "unknown";
}

// Language labels describe the reference recording, not guaranteed bilingual synthesis quality.
export function describeBreezeVoice(voice) {
  const explicit = typeof voice.metadata?.language === "string" && voice.metadata.language.trim();
  const language = explicit ? metadataLanguage(explicit) : referenceLanguage(voice.ref_text);
  return { characterId: characterId(voice), language, languageSource: language === "unknown" ? "unknown" : explicit ? "metadata" : "reference" };
}
