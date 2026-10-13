/** „Publicare programată” pe rândul unui portal (ora României). */
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bucharestLocalToUtc,
  formatScheduleLabel,
  scheduleWindowError,
  utcToBucharestParts,
  SCHEDULE_MAX_AHEAD_MS,
  SCHEDULE_MIN_LEAD_MS,
  type PortalScheduleView,
} from "@/lib/portals/publish-schedule";
import { cancelPortalSchedule, schedulePortalPublish } from "@/lib/portals/publish-schedule.functions";

export function PortalScheduleControl({
  organizationId,
  propertyId,
  portalId,
  portalName,
  promoted,
  schedule,
  canSchedule,
  canManage,
  onPublishNow,
  onChanged,
}: {
  organizationId?: string;
  propertyId: string;
  portalId: string;
  portalName: string;
  promoted?: boolean;
  schedule: PortalScheduleView | undefined;
  canSchedule: boolean;
  canManage: boolean;
  onPublishNow: () => Promise<void>;
  onChanged: () => void;
}) {
  const save = useServerFn(schedulePortalPublish);
  const cancel = useServerFn(cancelPortalSchedule);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");

  const orgPart = organizationId ? { organizationId } : {};

  if (schedule) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        <p className="w-full text-xs font-semibold text-gold-dark">
          Programat: {formatScheduleLabel(schedule.scheduledAt)}
        </p>
        {canManage ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onPublishNow();
                  onChanged();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Publicarea a eșuat.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Publică acum
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await cancel({ data: { ...orgPart, propertyId, portalId } });
                  toast.success(`${portalName}: programarea a fost anulată.`);
                  onChanged();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Anularea a eșuat.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Anulează programarea
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  if (!canSchedule) return null;

  const minParts = utcToBucharestParts(new Date(Date.now() + SCHEDULE_MIN_LEAD_MS).toISOString());
  const maxParts = utcToBucharestParts(new Date(Date.now() + SCHEDULE_MAX_AHEAD_MS).toISOString());

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          const tomorrow = utcToBucharestParts(new Date(Date.now() + 24 * 3_600_000).toISOString());
          setDate(tomorrow.date);
          setTime("08:00");
          setOpen(true);
        }}
      >
        <CalendarClock aria-hidden /> Publicare programată
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicare programată — {portalName}</DialogTitle>
            <DialogDescription>
              Ora României. Cel puțin 5 minute de acum, cel mult 90 de zile.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`schedule-date-${portalId}`}>Data</Label>
              <Input
                id={`schedule-date-${portalId}`}
                type="date"
                min={minParts.date}
                max={maxParts.date}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`schedule-time-${portalId}`}>Ora</Label>
              <Input
                id={`schedule-time-${portalId}`}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Renunță
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                const iso = bucharestLocalToUtc(date, time);
                const err = iso ? scheduleWindowError(iso) : "Alege data și ora.";
                if (err || !iso) {
                  toast.error(err ?? "Alege data și ora.");
                  return;
                }
                setBusy(true);
                try {
                  await save({
                    data: { ...orgPart, propertyId, portalId, scheduledAt: iso, ...(promoted !== undefined ? { promoted } : {}) },
                  });
                  toast.success(`${portalName}: programat pentru ${formatScheduleLabel(iso)}.`);
                  setOpen(false);
                  onChanged();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Programarea a eșuat.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Programează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
