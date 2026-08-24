import { SubmitForm } from "@/components/submit-form";
import { getNetworkConfigs } from "@/lib/config/networks";
import { formatUsdt } from "@/lib/domain/money";
import { getRepository } from "@/lib/repository";

export const metadata = {
  title: "Submit Project",
  description: "Submit or boost a project with verified USDT bidding.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SubmitPage({
  searchParams,
}: {
  searchParams:
    | Promise<{ boost?: string; target?: string; url?: string; category?: string }>
    | { boost?: string; target?: string; url?: string; category?: string };
}) {
  const params = await searchParams;
  const repository = getRepository();
  const boostProject = params.boost
    ? await repository.getProjectBySlug(params.boost)
    : null;
  const networks = getNetworkConfigs().map((network) => ({
    network: network.network,
    label: network.label,
    tokenStandard: network.tokenStandard,
    enabled: network.enabled,
    sourceStatus: network.sourceStatus,
  }));

  return (
    <main className="site-shell subpage-shell">
      <SubmitForm
        networks={networks}
        boostProject={
          boostProject
            ? {
                id: boostProject.id,
                name: boostProject.name,
                domain: new URL(boostProject.url).hostname,
                currentBidUsdt: formatUsdt(boostProject.totalBidUsdt),
              }
            : null
        }
        defaultTarget={params.target}
        defaultUrl={params.url}
        defaultCategory={params.category}
      />
    </main>
  );
}
