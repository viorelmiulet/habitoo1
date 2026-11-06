/** Progresul obiectivelor lunare, calculat din datele CRM. Folosit de pagina Obiective și de ecranul de start. */
export type GoalLike = { metric: string; period: string; user_id: string | null; target: number | string };
export type GoalData = {
  properties: { created_at: string; assigned_to: string | null }[];
  leads: { created_at: string; assigned_to: string | null; stage: string | null; value: number | string | null }[];
  activities: { starts_at: string; assigned_to: string | null; kind: string | null }[];
};

export function currentPeriod(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function periodRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(y, (m ?? 1) - 1, 1), end: new Date(y, m ?? 1, 1) };
}

export function goalRealized(goal: GoalLike, data: GoalData): number {
  const { start, end } = periodRange(goal.period);
  const inRange = (d: string) => {
    const t = new Date(d).getTime();
    return t >= start.getTime() && t < end.getTime();
  };
  const mine = (assigned: string | null) => !goal.user_id || assigned === goal.user_id;
  const won = () => data.leads.filter((l) => l.stage === "won" && inRange(l.created_at) && mine(l.assigned_to));
  switch (goal.metric) {
    case "new_properties":
      return data.properties.filter((p) => inRange(p.created_at) && mine(p.assigned_to)).length;
    case "leads":
      return data.leads.filter((l) => inRange(l.created_at) && mine(l.assigned_to)).length;
    case "viewings":
      return data.activities.filter((a) => a.kind === "viewing" && inRange(a.starts_at) && mine(a.assigned_to)).length;
    case "transactions":
      return won().length;
    case "commission":
      return won().reduce((s, l) => s + Number(l.value ?? 0), 0);
    default:
      return 0;
  }
}

export function goalPercent(realized: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((realized / target) * 100)) : 0;
}
