// Idempotent content patches to the current bundled Gallery runtime; fail on source drift.
import fs from "node:fs";
const file = new URL("../../../../public/active-theory-gallery/gallery/assets/js/app.1780406240914.js", import.meta.url);
let source = fs.readFileSync(file, "utf8");
function replace(before, after) {
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error(`Gallery content patch drift: ${before.slice(0, 100)}`);
  source = source.replace(before, after);
}
// Preserve the authored Latin card typography; bilingual names render in the existing DOM.
// Full metadata must retain company commas and all supplied debut years.
replace("seo:data.name,title:data.name,subhead:data.description,", "seo:data.name,title:data.name,detailTitle:data.detailTitle,detailMeta:data.detailMeta,subhead:data.description,");
replace("(({title:title,date:date,body:body,tags:tags,caseStudyURL:caseStudyURL,projectURL:projectURL,ai:ai,color:color})=>{const animateEntry=", "(({title:title,detailTitle:detailTitle,detailMeta:detailMeta,date:date,body:body,tags:tags,caseStudyURL:caseStudyURL,projectURL:projectURL,ai:ai,color:color})=>{const animateEntry=");
replace("let text=date.replace(/\\n/g,\" / \");text=text.split(\",\")[0];", "let text=detailMeta||date.replace(/\\n/g,\" / \");if(!detailMeta)text=text.split(\",\")[0];");
replace("text:`${title}`,color:col.getHexString(),animated:animateEntry", "text:`${detailTitle||title}`,color:col.getHexString(),animated:animateEntry");
fs.writeFileSync(file, source);
