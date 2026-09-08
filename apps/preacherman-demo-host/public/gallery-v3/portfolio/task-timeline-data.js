// Display-only dates for the original demonstration cards; never write task timestamps.
const DEMO_DAYS = ["2026-09-07", "2026-09-08", "2026-09-09"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function taskTimelineLabel(day, includeYear = false) {
  if (day === "undated") return "Earlier";
  const [year, month, value] = day.split("-");
  const date = Number(value), lastTwo = date % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : ({1: "st", 2: "nd", 3: "rd"}[date % 10] ?? "th");
  return `${MONTHS[Number(month) - 1]}.${date}${suffix}${includeYear ? ` ${year}` : ""}`;
}

// A low resting rhythm, rising around each date and around the pointer.
export function taskTickHeight(dateDistance, pointerDistance = Infinity) {
  const rise = (distance, radius) => Math.pow(Math.max(0, 1 - Math.abs(distance) / radius), 2);
  return 8 + Math.max(18 * rise(dateDistance, 88), 30 * rise(pointerDistance, 74));
}

export function taskNameBounds(rect, column, viewport) {
  const bounds = {left: Math.max(rect.left, column.left, viewport.left), top: Math.max(rect.top, column.top, viewport.top), right: Math.min(rect.right, column.right, viewport.right), bottom: Math.min(rect.bottom, column.bottom, viewport.bottom)};
  return bounds.left < bounds.right && bounds.top < bounds.bottom ? bounds : null;
}

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
  return sorted.map(group => ({...group, label: taskTimelineLabel(group.day, years.size > 1)}));
}
