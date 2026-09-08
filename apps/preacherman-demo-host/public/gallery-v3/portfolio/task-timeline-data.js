// Display-only dates for the original demonstration cards; never write task timestamps.
const DEMO_DAYS = ["2026-09-07", "2026-09-08", "2026-09-09"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function localTaskDay(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function taskTimelineGroups(projects, records, authoredSlugs) {
  const saved = new Map(records.map(record => [record.id, record]));
  const demo = new Map(authoredSlugs.map((slug, index) => [slug, DEMO_DAYS[Math.min(2, Math.floor(index * 3 / authoredSlugs.length))]]));
  const groups = new Map();
  for (const [index, project] of projects.entries()) {
    const record = saved.get(project.slug);
    const day = localTaskDay(record?.createdAt ?? project.createdAt) ?? (!project.preachermanTask ? demo.get(project.slug) : null) ?? "undated";
    if (!groups.has(day)) groups.set(day, {day, items: []});
    groups.get(day).items.push({project, index});
  }
  const sorted = [...groups.values()].sort((a, b) => a.day.localeCompare(b.day));
  const years = new Set(sorted.filter(group => group.day !== "undated").map(group => group.day.slice(0, 4)));
  return sorted.map(group => {
    const [year, month, day] = group.day.split("-");
    return {...group, label: group.day === "undated" ? "Earlier" : `${Number(day)}.${MONTHS[Number(month) - 1]}${years.size > 1 ? ` ${year}` : ""}`};
  });
}
