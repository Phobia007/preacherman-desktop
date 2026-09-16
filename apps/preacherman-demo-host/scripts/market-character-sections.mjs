import { readFile } from "node:fs/promises";

// Keep the authored first row layout and CTA destination; replace only character copy.
// This also runs after vendor re-imports so they cannot restore bracelet imagery.
export async function populateMarketCharacters(html) {
  const characters = JSON.parse(await readFile(new URL("../public/market-love/characters.json", import.meta.url), "utf8"));
  const rowPattern = /<div class="module-grid__item col-12 col-md-12 col-lg-12">\s*<article\b[\s\S]*?<\/article>\s*<\/div>/g;
  const rows = [...html.matchAll(rowPattern)];
  if (!rows.length || !rows[0][0].includes('data-od-id="style-heading"')) throw new Error("Missing Market first-row template");
  const template = rows[0][0];
  const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const existingIds = ["style", "material", "diamonds", "finish", "closure"];
  const sections = characters.map((character, index) => {
    const sectionId = existingIds[index] || `character-${character.id}`;
    let row = template.replace(/ data-character-id="[^"]*"/, "")
      .replace('id="style"', `id="${sectionId}" data-character-id="${escape(character.id)}"`)
      .replaceAll('data-od-id="love-style"', `data-od-id="love-${sectionId}"`)
      .replaceAll('data-od-id="style-heading"', `data-od-id="${sectionId}-heading"`)
      .replaceAll('data-od-id="style-start"', `data-od-id="${sectionId}-start"`)
      .replace(/(<h2\b[^>]*>)[\s\S]*?(<\/h2>)/, (_, open, close) => `${open}${escape(character.name.toUpperCase())}${close}`)
      .replace(/(<div class="descriptive-card__description[^>]*>)[\s\S]*?(<\/div>)/, (_, open, close) => `${open}${escape(character.summary)}${close}`)
      .replace(/href="love-configurator\.html(?:\?[^"]*)?"/, `href="love-configurator.html?character=${encodeURIComponent(character.id)}"`)
      .replace(/aria-label="[^"]*"/, `aria-label="${escape(character.name)}, Details"`)
      .replace(/(<a\b[^>]*>)[\s\S]*?(<\/a>)/, (_, open, close) => `${open}Details${close}`)
      .replace(/<img\b[^>]*>/, `<img src="${escape(character.image)}" class="component-image descriptive-card__img object-fit--cover" alt="${escape(character.name)}" width="${character.width}" height="${character.height}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async"${index === 0 ? ' fetchpriority="high"' : ''}>`);
    if (index % 2 === 1) row = row.replace('class="col-12 col-md-6 col-lg-6 "', 'class="col-12 col-md-6 col-lg-6 order--small-up-1"');
    return row;
  }).join("\n");
  let first = true;
  return html.replace(rowPattern, () => {
    if (!first) return "";
    first = false;
    return sections;
  }).replace(/Browse (?:the five retained|all \d+ Gallery character) image\/text sections/g, `Browse all ${characters.length} Gallery character image/text sections`);
}
