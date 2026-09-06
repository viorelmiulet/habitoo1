/**
 * Widget global de suport, disponibil din topbar pe orice pagină din zona
 * autentificată. Deschide un tichet către Superadmin și atașează automat
 * pagina din care a fost trimis (context de debugging, nu vizibil userului).
 */
import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toastError } from "@/lib/errors";
import { createSupportTicket, SUPPORT_CATEGORIES, type SupportCategory } from "@/lib/support.functions";

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("technical");
  const [body, setBody] = useState("");
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const create = useServerFn(createSupportTicket);

  const submit = useMutation({
    mutationFn: async () => {
      if (subject.trim().length < 4) throw new Error("Adaugă un subiect (minim 4 caractere).");
      if (body.trim().length < 10) throw new Error("Descrie problema în câteva cuvinte (minim 10 caractere).");
      return create({
        data: { subject: subject.trim(), body: body.trim(), category, contextPath: pathname.slice(0, 300) },
      });
    },
    onSuccess: () => {
      setOpen(false);
      setSubject("");
      setBody("");
      setCategory("technical");
      void qc.invalidateQueries({ queryKey: ["support-tickets"] });
      toast.success("Tichetul a fost trimis. Îți răspundem în „Tichetele mele”.");
    },
    onError: (e) => toastError(e),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ajutor și suport">
              <LifeBuoy className="size-5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Ajutor și suport</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trimite un tichet către suport</DialogTitle>
          <DialogDescription>
            Echipa Habitoo îți răspunde direct în aplicație. Poți urmări conversația în{" "}
            <Link to="/app/support" onClick={() => setOpen(false)} className="font-medium text-primary underline">
              Tichetele mele
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="support-subject">Subiect</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex. Nu pot încărca fotografii la o proprietate"
              maxLength={160}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="support-category">Categorie</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)}>
              <SelectTrigger id="support-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="support-body">Mesaj</Label>
            <Textarea
              id="support-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Descrie ce ai încercat să faci și ce s-a întâmplat."
              maxLength={5000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Anulează
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Trimite tichetul
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
