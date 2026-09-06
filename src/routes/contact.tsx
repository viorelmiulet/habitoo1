import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CalendarCheck, Info, MailCheck, MessageSquare, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { navyButton } from "@/components/marketing/PublicHeader";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { CrmLink } from "@/components/marketing/CrmLink";
import { submitContactRequest } from "@/lib/contact.functions";

const TITLE = "Contact și demonstrație — Habitoo CRM";
const DESCRIPTION =
  "Solicită o demonstrație Habitoo CRM sau pune-ne o întrebare despre produs și planuri. Îți răspundem cu o prezentare adaptată agenției tale.";

const interests = ["demo", "produs", "preturi", "altceva"] as const;
type Interest = (typeof interests)[number];

const interestLabels: Record<Interest, string> = {
  demo: "Vreau o demonstrație",
  produs: "Întrebări despre produs",
  preturi: "Prețuri și planuri",
  altceva: "Altceva",
};

const searchSchema = z.object({
  interes: z.enum(interests).optional().catch(undefined),
});

export const Route = createFileRoute("/contact")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () =>
    publicHead({
      path: "/contact",
      title: TITLE,
      description: DESCRIPTION,
    }),
  component: ContactPage,
});

const formSchema = z.object({
  name: z.string().trim().min(2, "Introdu numele tău complet."),
  email: z.string().trim().email("Introdu o adresă de email validă."),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[+0-9 ().-]{7,20}$/.test(v), "Introdu un număr de telefon valid."),
  agency: z.string().trim().min(2, "Introdu numele agenției."),
  interest: z.enum(interests),
  message: z.string().trim().min(10, "Spune-ne în câteva cuvinte cu ce te putem ajuta."),
});

type FormValues = z.infer<typeof formSchema>;

const nextSteps = [
  {
    icon: MailCheck,
    title: "Confirmăm solicitarea",
    text: "Revenim către tine pentru a stabili un moment potrivit.",
  },
  {
    icon: CalendarCheck,
    title: "Programăm demonstrația",
    text: "O sesiune ghidată, pe un scenariu apropiat de activitatea agenției tale.",
  },
  {
    icon: Sparkles,
    title: "Îți configurăm agenția",
    text: "Te ajutăm să pornești cu echipa, proprietățile și cererile tale.",
  },
];

function ContactPage() {
  const { interes } = Route.useSearch();
  const [submitted, setSubmitted] = useState<FormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = useServerFn(submitContactRequest);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      agency: "",
      interest: interes ?? "demo",
      message: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await send({
        data: {
          ...values,
          phone: values.phone?.trim() ? values.phone.trim() : undefined,
          sourcePath: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
        },
      });
      setSubmitted(values);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Nu am putut trimite solicitarea. Te rugăm să încerci din nou sau scrie-ne la contact@habitoo.ro.",
      );
    }
  }

  return (
    <PublicLayout>
      <section className="mk-hero-bg relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="mk-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_60%_at_50%_0%,black,transparent)]"
        />
        <Container className="relative py-16 sm:py-20">
          <SectionHeading
            as="h1"
            eyebrow="Contact"
            title="Hai să vorbim despre agenția ta"
            text="Solicită o demonstrație sau pune-ne orice întrebare despre Habitoo CRM. Îți răspundem cu o prezentare adaptată felului în care lucrează echipa ta."
          />
        </Container>
      </section>

      <Section className="pt-12 sm:pt-16">
        <Container className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="panel p-6 sm:p-8">
              {error ? (
                <Alert variant="destructive" className="mb-6">
                  <Info className="size-4" />
                  <AlertTitle>Solicitarea nu a putut fi trimisă</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {submitted ? (
                <div className="rounded-2xl border border-border bg-muted/40 p-6" role="status">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success">
                      <MessageSquare className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-navy">Solicitarea ta a fost trimisă</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Am primit mesajul tău și revenim în cel mai scurt timp la {submitted.email}. Iată ce
                        ne-ai trimis:
                      </p>
                      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-muted-foreground">Nume</dt>
                          <dd className="font-medium">{submitted.name}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Email</dt>
                          <dd className="font-medium break-all">{submitted.email}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Agenție</dt>
                          <dd className="font-medium">{submitted.agency}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Motiv</dt>
                          <dd className="font-medium">{interestLabels[submitted.interest]}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-muted-foreground">Mesaj</dt>
                          <dd className="whitespace-pre-line">{submitted.message}</dd>
                        </div>
                      </dl>
                      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSubmitted(null);
                            form.reset({ ...form.getValues(), message: "" });
                          }}
                        >
                          Trimite alt mesaj
                        </Button>
                        <Button asChild className={navyButton}>
                          <CrmLink to="/register">
                            Creează agenția acum <ArrowRight />
                          </CrmLink>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nume complet</FormLabel>
                            <FormControl>
                              <Input placeholder="Andrei Popescu" autoComplete="name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="andrei@agentia-ta.ro"
                                autoComplete="email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefon (opțional)</FormLabel>
                            <FormControl>
                              <Input type="tel" placeholder="07xx xxx xxx" autoComplete="tel" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="agency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Agenție</FormLabel>
                            <FormControl>
                              <Input placeholder="Numele agenției" autoComplete="organization" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="interest"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cu ce te putem ajuta?</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Alege un motiv" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {interests.map((i) => (
                                <SelectItem key={i} value={i}>
                                  {interestLabels[i]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mesaj</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={5}
                              placeholder="Câți agenți sunteți, ce tip de proprietăți lucrați și ce v-ar ajuta cel mai mult."
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Câteva detalii despre agenție ne ajută să pregătim o demonstrație relevantă.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      size="lg"
                      disabled={form.formState.isSubmitting}
                      className={`${navyButton} h-12 w-full sm:w-auto`}
                    >
                      {form.formState.isSubmitting ? "Se trimite..." : "Trimite solicitarea"} <ArrowRight />
                    </Button>
                  </form>
                </Form>
              )}
            </div>
          </div>

          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <h2 className="text-xl font-semibold text-navy">Ce urmează după ce ne scrii</h2>
              <ol className="mt-6 space-y-5">
                {nextSteps.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-navy text-navy-foreground">
                      <s.icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="font-sans text-sm font-semibold text-navy">
                        {i + 1}. {s.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-navy">Preferi să începi singur?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Poți crea agenția chiar acum și poți explora toate modulele cu datele tale.
                </p>
                <Button asChild variant="link" className="mt-2 h-auto px-0">
                  <CrmLink to="/register">
                    Creează agenția <ArrowRight />
                  </CrmLink>
                </Button>
              </div>
            </div>
          </aside>
        </Container>
      </Section>
    </PublicLayout>
  );
}
