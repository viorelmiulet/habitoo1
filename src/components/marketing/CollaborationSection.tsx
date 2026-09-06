import { Handshake, MessageCircle, Search, Tag } from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";
import { Container, Section, SectionHeading } from "@/components/marketing/Section";

const steps = [
  {
    icon: Tag,
    title: "Marchezi proprietatea pentru colaborare",
    text: "Alegi ce oferte cu mandat vrei să împarți cu alte agenții Habitoo și stabilești comisionul oferit celui care aduce cumpărătorul.",
  },
  {
    icon: Search,
    title: "Alte agenții o descoperă și o propun",
    text: "Agențiile Habitoo participante văd doar proprietățile marcate pentru colaborare și le pot propune clienților proprii, fără să acceseze datele tale interne.",
  },
  {
    icon: MessageCircle,
    title: "Comunicați direct în platformă",
    text: "Pentru fiecare propunere se deschide un fir de mesaje între agentul care deține mandatul și cel care a adus clientul, pentru programări și detalii.",
  },
  {
    icon: Handshake,
    title: "Tranzacție cu comision împărțit",
    text: "Când afacerea se finalizează, comisionul se împarte conform procentului stabilit de agenția care deține mandatul — un acord clar de la început.",
  },
];

export function CollaborationSection() {
  return (
    <Section id="colaborare" tone="muted">
      <Container>
        <SectionHeading
          eyebrow={
            <>
              <Handshake className="size-3.5" /> Colaborare Habitoo
            </>
          }
          title="Colaborează cu alte agenții Habitoo — extinde-ți portofoliul fără costuri suplimentare"
          text="O rețea internă de colaborare între agențiile care folosesc Habitoo: împarți oferte cu mandat, primești propuneri de clienți și crești șansele de tranzacție, fără a expune date confidențiale."
        />

        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="relative">
              <Reveal delay={i * 60} className="h-full">
                <div className="panel flex h-full flex-col p-5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-gold/12 text-gold">
                    <step.icon className="size-5" />
                  </span>
                  <span className="mt-4 text-xs font-semibold text-muted-foreground tabular-nums">
                    0{i + 1}
                  </span>
                  <h3 className="mt-2 font-sans text-sm font-semibold text-navy">{step.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-2xl border border-border bg-card p-5 text-center sm:p-6">
          <p className="text-sm text-muted-foreground">
            Colaborarea Habitoo este disponibilă exclusiv între agențiile înscrise pe platformă.
            Fiecare agenție decide dacă participă și ce proprietăți marchează pentru colaborare.
          </p>
        </div>
      </Container>
    </Section>
  );
}
