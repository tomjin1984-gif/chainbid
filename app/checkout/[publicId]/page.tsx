import { notFound } from "next/navigation";
import { CheckoutClient } from "@/components/checkout-client";
import { isProduction } from "@/lib/config/env";
import { decodeDevelopmentCheckout } from "@/lib/dev-checkout-token";
import {
  getNetworkConfig,
  getNetworkConfigs,
  isNetworkAvailableForCheckout,
} from "@/lib/config/networks";
import { createQrDataUrl } from "@/lib/payment/qr";
import { buildPaymentPayload, warningForNetwork } from "@/lib/payment/uris";
import { getRepository } from "@/lib/repository";
import { publicPaymentOrder } from "@/lib/repository/serializers";

export const metadata = {
  title: "USDT Checkout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }> | { publicId: string };
  searchParams: Promise<{ dev?: string }> | { dev?: string };
}) {
  const { publicId } = await params;
  const query = await searchParams;
  const repository = getRepository();
  const networks = getNetworkConfigs().map((network) => ({
    network: network.network,
    label: network.label,
    tokenStandard: network.tokenStandard,
    enabled: isNetworkAvailableForCheckout(network),
  }));
  const order = await repository.getPaymentOrder(publicId);
  if (!order) {
    if (isProduction()) {
      notFound();
    }

    const developmentCheckout = decodeDevelopmentCheckout(query.dev);
    if (developmentCheckout) {
      const qrDataUrl = await createQrDataUrl(developmentCheckout.paymentPayload);
      const network = getNetworkConfig(developmentCheckout.order.network ?? "tron");
      return (
        <main className="site-shell subpage-shell">
          <CheckoutClient
            initialOrder={{ ...developmentCheckout.order, network: network.network }}
            projectName={developmentCheckout.project?.name ?? "Project"}
            initialNetwork={{
              network: network.network,
              label: developmentCheckout.network.label,
              tokenStandard: developmentCheckout.network.tokenStandard,
              warning: developmentCheckout.network.warning,
            }}
            initialQrDataUrl={qrDataUrl}
            networks={networks}
          />
        </main>
      );
    }

    return (
      <main className="site-shell subpage-shell">
        <section className="form-panel narrow-panel">
          <p className="eyebrow">CHECKOUT</p>
          <h1>Payment order not found.</h1>
          <p className="muted-copy">
            In production this means the order is missing from Supabase. In local development, create the order from the submit page.
          </p>
        </section>
      </main>
    );
  }

  const project = await repository.getProjectById(order.projectId);
  const network = getNetworkConfig(order.network);
  const paymentPayload = buildPaymentPayload(order);
  const qrDataUrl = await createQrDataUrl(paymentPayload);

  return (
    <main className="site-shell subpage-shell">
      <CheckoutClient
        initialOrder={publicPaymentOrder(order)}
        projectName={project?.name ?? "Project"}
        initialNetwork={{
          network: network.network,
          label: network.label,
          tokenStandard: network.tokenStandard,
          warning: warningForNetwork(network.label),
        }}
        initialQrDataUrl={qrDataUrl}
        networks={networks}
      />
    </main>
  );
}
