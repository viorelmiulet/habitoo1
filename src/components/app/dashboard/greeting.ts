/** Formula de salut după ora locală: până la 12, 12–18, după 18. */
export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Bună dimineața";
  if (h < 18) return "Bună ziua";
  return "Bună seara";
}

/** „Duminică, 1 noiembrie” */
export function dashboardDateLabel(date: Date): string {
  const s = new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function todaySummary(count: number): string {
  if (count === 0) return "Nicio activitate azi";
  if (count === 1) return "O activitate azi";
  return `${count} ${count >= 20 ? "de " : ""}activități azi`;
}
