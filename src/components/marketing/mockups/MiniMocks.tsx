import { Bell, CheckCircle2, Circle, Phone, Shield, Star, Users, Video } from "lucide-react";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { activityKindLabels, contactTypeLabels, requestKindLabels, roleLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { mockContacts, mockGoals, mockPhotos, mockRequests } from "../mock-data";

function Panel({ title, meta, children, className }: { title: string; meta?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mk-frame min-w-0 overflow-hidden", className)}>
      <div className="border-b border-border bg-muted/50 px-4 py-2.5">
        <p className="text-xs font-semibold">{title}</p>
        {meta ? <p className="text-[10px] text-muted-foreground">{meta}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function ContactsMini({ className }: { className?: string }) {
  return (
    <Panel title="Contacte" meta="Fișă 360° · cereri, lead-uri, activități" className={className}>
      <ul className="divide-y divide-border">
        {mockContacts.map((c) => (
          <li key={c.name} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
              {c.name
                .split(" ")
                .map((s) => s[0])
                .join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{c.name}</p>
              <p className="truncate text-[10px] text-muted-foreground">{c.meta}</p>
            </div>
            <StatusBadge tone="neutral" className="text-[9px]">
              {contactTypeLabels[c.type]}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function RequestsMini({ className }: { className?: string }) {
  return (
    <Panel title="Cereri" meta="Criterii structurate · potriviri calculate live" className={className}>
      <ul className="divide-y divide-border">
        {mockRequests.map((r) => (
          <li key={r.title} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium">{r.title}</p>
              <StatusBadge tone="primary" className="text-[9px]">
                {requestKindLabels[r.kind]}
              </StatusBadge>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Buget {r.budget}</span>
              <span className="font-medium text-success">{r.matches} potriviri</span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const activities = [
  { kind: "call", title: "Apel — Radu Constantin", when: "azi 09:30", done: true },
  { kind: "viewing", title: "Vizionare RF-1024 — Mihai Ionescu", when: "azi 11:30", done: false },
  { kind: "followup", title: "Follow-up ofertă — Andreea Popescu", when: "azi 15:00", done: false },
  { kind: "task", title: "Trimite documente precontract", when: "mâine", done: false },
];

export function ActivitiesMini({ className }: { className?: string }) {
  return (
    <Panel title="Activități" meta="Apeluri, vizionări, follow-up-uri, task-uri" className={className}>
      <ul className="divide-y divide-border">
        {activities.map((a) => (
          <li key={a.title} className="flex items-center gap-3 px-4 py-2.5">
            {a.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground/50" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-xs font-medium", a.done && "text-muted-foreground line-through")}>
                {a.title}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {activityKindLabels[a.kind]} · {a.when}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const week = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const events: Record<number, { label: string; kind: "viewing" | "call" | "meeting" }[]> = {
  1: [{ label: "Vizionare RF-1024", kind: "viewing" }],
  2: [
    { label: "Apel follow-up", kind: "call" },
    { label: "Întâlnire proprietar", kind: "meeting" },
  ],
  3: [{ label: "Vizionare RF-1017", kind: "viewing" }],
  4: [{ label: "Semnare precontract", kind: "meeting" }],
};
const eventTone = {
  viewing: "bg-primary/12 text-primary",
  call: "bg-gold/15 text-gold",
  meeting: "bg-info/12 text-info",
};

export function CalendarMini({ className }: { className?: string }) {
  return (
    <Panel title="Calendar" meta="Săptămâna 13–19 mai · vizionări și întâlniri" className={className}>
      <div className="grid grid-cols-7 gap-px bg-border">
        {week.map((d, i) => (
          <div key={d} className="min-h-24 bg-background p-1.5">
            <p className={cn("text-[10px] font-semibold", i === 1 && "text-primary")}>
              {d} <span className="text-muted-foreground">{13 + i}</span>
            </p>
            <div className="mt-1 space-y-1">
              {(events[i] ?? []).map((e) => (
                <span
                  key={e.label}
                  className={cn("block truncate rounded px-1 py-0.5 text-[8px] font-medium", eventTone[e.kind])}
                >
                  {e.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function GoalsMini({ className }: { className?: string }) {
  return (
    <Panel title="Obiective" meta="Ținte lunare pe agent și pe agenție" className={className}>
      <ul className="space-y-3 p-4">
        {mockGoals.map((g) => (
          <li key={g.label}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium">
                {g.agent} · {g.label}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {g.current} / {g.target}
              </span>
            </div>
            <Progress value={(g.current / g.target) * 100} className="h-2" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function MediaMini({ className }: { className?: string }) {
  const photos = [mockPhotos.living, mockPhotos.kitchen, mockPhotos.bedroom, mockPhotos.exterior];
  return (
    <Panel title="Media manager" meta="Încărcare, reordonare, fotografie principală" className={className}>
      <div className="grid grid-cols-4 gap-2 p-3">
        {photos.map((src, i) => (
          <div key={i} className="relative overflow-hidden rounded-lg">
            <img src={src} alt="" width={768} height={512} loading="lazy" className="aspect-[4/3] w-full object-cover" />
            {i === 0 ? (
              <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-gold px-1 py-0.5 text-[8px] font-semibold text-gold-foreground">
                <Star className="size-2.5 fill-current" /> Principală
              </span>
            ) : null}
            <span className="absolute right-1 bottom-1 rounded bg-navy/70 px-1 text-[8px] font-medium text-navy-foreground">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const team = [
  { name: "Andrei M.", role: "agency_admin" },
  { name: "Ioana R.", role: "agent" },
  { name: "Vlad P.", role: "agent" },
];

export function TeamMini({ className }: { className?: string }) {
  return (
    <Panel title="Echipă și roluri" meta="Admin agenție și agenți, cu permisiuni diferite" className={className}>
      <ul className="divide-y divide-border">
        {team.map((m) => (
          <li key={m.name} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy text-[10px] font-semibold text-navy-foreground">
              {m.name.split(" ")[0]![0]}
              {m.name.split(" ")[1]![0]}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs font-medium">{m.name}</p>
            <StatusBadge tone={m.role === "agency_admin" ? "primary" : "neutral"} className="text-[9px]">
              {m.role === "agency_admin" ? <Shield className="size-3" /> : <Users className="size-3" />}
              {roleLabels[m.role]}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const notifications = [
  { icon: Video, text: "Vizionare confirmată — RF-1024, joi 18:00", when: "acum 5 min" },
  { icon: Phone, text: "Lead nou atribuit: Andreea Popescu", when: "acum 40 min" },
  { icon: Bell, text: "Cerere actualizată · 2 potriviri noi", when: "azi 08:10" },
];

export function NotificationsMini({ className }: { className?: string }) {
  return (
    <Panel title="Notificări" meta="Ce s-a întâmplat cât timp erai pe teren" className={className}>
      <ul className="divide-y divide-border">
        {notifications.map((n) => (
          <li key={n.text} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <n.icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug font-medium">{n.text}</p>
              <p className="text-[10px] text-muted-foreground">{n.when}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
