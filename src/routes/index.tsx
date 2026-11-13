import { createFileRoute, redirect } from "@tanstack/react-router";
import { faqPageJsonLd } from "@/components/marketing/FaqSection";
import { HomeContent } from "@/components/marketing/home/HomeContent";
import { HOME_DESCRIPTION, HOME_FAQ, HOME_TITLE } from "@/components/marketing/home/home-content";
import { homeIdentityJsonLd } from "@/components/marketing/structured-data";
import { publicHead } from "@/components/marketing/public-head";
import { getPublicDynamicFeedPortals } from "@/lib/dynamic-feed-portals.functions";
import { getCurrentHostname } from "@/lib/current-host";
import { isCrmHostname } from "@/lib/host";

export const Route = createFileRoute("/")({
  loader: () => getPublicDynamicFeedPortals(),
  beforeLoad: () => {
    if (isCrmHostname(getCurrentHostname())) throw redirect({ to: "/app" });
  },
  head: () =>
    publicHead({
      path: "/",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      jsonLd: [...homeIdentityJsonLd(HOME_DESCRIPTION), faqPageJsonLd(HOME_FAQ)],
    }),
  component: HomePage,
});

function HomePage() {
  const dynamic = Route.useLoaderData();
  return <HomeContent dynamic={dynamic ?? []} />;
}
