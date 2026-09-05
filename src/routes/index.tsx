import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  Users,
  Target,
  CalendarCheck,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Habitoo — CRM imobiliar pentru agențiile din România" },
      {
        name: "description",
        content:
          "CRM imobiliar multi-agenție: portofoliu de proprietăți, contacte, cereri, lead-uri, matching automat și rapoarte, într-o singură platformă.",
      },
      { property: "og:title", content: "Habitoo — CRM imobiliar modern" },
      {
        property: "og:description",
        content:
          "Gestionează proprietăți, clienți, cereri și lead-uri cu matching automat și rapoarte în timp real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Building2,
    title: "Portofoliu de proprietăți",
    text: "Listări complete cu preț, caracteristici, zonă, status și istoric — editabile direct din listă.",
  },
  {
    icon: Users,
    title: "Clienți în vedere 360°",
    text: "Contacte, cereri, lead-uri și tot istoricul de interacțiuni, într-un singur ecran.",
  },
  {
    icon: Sparkles,
    title: "Matching automat",
    text: "Fiecare cerere primește proprietățile potrivite, cu scor și motivele potrivirii.",
  },
  {
    icon: CalendarCheck,
    title: "Activități și calendar",
    text: "Vizionări, apeluri și follow-up-uri programate, cu agenda zilei pe dashboard.",
  },
  {
    icon: BarChart3,
    title: "Rapoarte și obiective",
    text: "Performanța agenției și a fiecărui agent, cu ținte lunare și progres live.",
  },
  {
    icon: ShieldCheck,
    title: "Date separate și sigure",
    text: "Fiecare agenție își vede doar datele ei, cu roluri pentru administrator și agenți.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 lg:px-8">
        <Link to="/" className="block w-36 sm:w-44" aria-label="Habitoo CRM — pagina principală">
          <BrandLogo priority />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Autentificare</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/register">Începe gratuit</Link>
          </Button>
        </nav>
      </header>

      <section className="hero-gradient border-y border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center lg:px-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5" /> CRM imobiliar pentru agențiile din România
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">
            Toată agenția ta, <span className="text-gradient">într-un singur loc</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            Proprietăți, clienți, cereri și lead-uri organizate impecabil. Potriviri automate între
            cerere și ofertă, agenda echipei și rapoarte care arată exact unde stai.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">
                Creează-ți agenția <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Am deja cont</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 lg:px-8">
        <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
          Tot ce folosește o agenție, zi de zi
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="panel p-6">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center lg:px-8">
          <Target className="size-8 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Pornește în câteva minute
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Îți creezi contul, îți configurezi agenția și începi să adaugi proprietăți și clienți. Fără
            instalări, fără setări complicate.
          </p>
          <Button asChild size="lg">
            <Link to="/register">Începe acum</Link>
          </Button>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-xs text-muted-foreground lg:flex-row lg:px-8">
        <div className="flex items-center gap-3">
          <BrandLogo className="w-24" />
          <span>© {new Date().getFullYear()}</span>
        </div>
        <span>Construit pentru agenții din România.</span>
      </footer>
    </div>
  );
}
