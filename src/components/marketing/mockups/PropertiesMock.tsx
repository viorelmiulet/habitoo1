import { BedDouble, Building, Layers, Ruler, Star } from "lucide-react";
import { StatusBadge } from "@/components/app/StatusBadge";
import { formatMoney } from "@/lib/format";
import { propertyStatusLabels, propertyStatusTone, transactionLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { mockPortfolio, mockProperty } from "../mock-data";
import { AppFrame, MockToolbar } from "./AppFrame";

export function PropertiesMock({ className }: { className?: string }) {
  const p = mockProperty;
  return (
    <AppFrame title={`proprietati / ${p.reference}`} className={className} activeIndex={1}>
      <MockToolbar
        title={p.title}
        meta={`${p.reference} · ${p.district}, ${p.city}`}
        action="Editează"
      />
      <div className="grid gap-4 p-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="grid grid-cols-3 grid-rows-2 gap-1.5 overflow-hidden rounded-xl">
            <img
              src={p.photos[0]}
              alt="Living luminos al apartamentului demonstrativ"
              width={768}
              height={512}
              loading="lazy"
              className="col-span-2 row-span-2 aspect-[4/3] h-full w-full object-cover"
            />
            <img
              src={p.photos[1]}
              alt="Bucătărie"
              width={768}
              height={512}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <div className="relative">
              <img
                src={p.photos[2]}
                alt="Dormitor"
                width={768}
                height={512}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-navy/55 text-xs font-semibold text-navy-foreground">
                +3 foto
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone={propertyStatusTone[p.status]}>
              {propertyStatusLabels[p.status]}
            </StatusBadge>
            <StatusBadge tone="primary">{transactionLabels[p.transaction]}</StatusBadge>
            <span className="ml-auto text-lg font-semibold tracking-tight text-navy">
              {formatMoney(p.price, p.currency)}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
            {[
              { icon: BedDouble, label: "Camere", value: String(p.rooms) },
              { icon: Ruler, label: "Suprafață", value: `${p.surface} m²` },
              { icon: Layers, label: "Etaj", value: p.floor },
              { icon: Building, label: "An", value: String(p.year) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-muted/40 p-2">
                <dt className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Icon className="size-3" /> {label}
                </dt>
                <dd className="mt-0.5 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.features.map((f) => (
              <span
                key={f}
                className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <p className="mb-2 text-xs font-semibold">Portofoliu · 48 active</p>
          <ul className="space-y-2">
            {mockPortfolio.slice(1).map((item, i) => (
              <li
                key={item.reference}
                className="flex items-center gap-3 rounded-lg border border-border p-2"
              >
                <img
                  src={item.photo}
                  alt=""
                  width={768}
                  height={512}
                  loading="lazy"
                  className="size-12 shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{item.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {item.reference} · {item.rooms} cam · {item.surface} m²
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <StatusBadge
                      tone={propertyStatusTone[item.status]}
                      className="px-1.5 py-0 text-[9px]"
                    >
                      {propertyStatusLabels[item.status]}
                    </StatusBadge>
                    <span className="text-[10px] font-semibold text-navy">
                      {formatMoney(item.price)}
                      {item.transaction === "rent" ? "/lună" : ""}
                    </span>
                  </div>
                </div>
                <Star
                  className={cn(
                    "size-3.5 shrink-0",
                    i === 0 ? "fill-gold text-gold" : "text-border",
                  )}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppFrame>
  );
}
