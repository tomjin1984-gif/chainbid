import { notFound } from "next/navigation";
import { CheckoutClient } from "@/components/checkout-client";
import { isProduction } from "@/lib/config/env";
import { decodeDevelopmentCheckout } from "@/lib/dev-checkout-token";
import { getNetworkConfig } from "@/lib/config/networks";
import { createQrDataUrl } from "@/lib/payment/qr";
import { buildPaymentPayload, warningForNetwork } from "@/lib/payment/uris";
import { getRepository } from "@/lib/repository";
import { publicPaymentOrder } from "@/lib/repository/serializers";

export const metadata = {
  title: "USDT Checkout",
  robots: { index: false, follow: false },
};

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
  const order = await repository.getPaymentOrder(publicId);
  if (!order) {
    if (isProduction()) {
      notFound();
    }

    const developmentCheckout = decodeDevelopmentCheckout(query.dev);
    if (developmentCheckout) {
      const qrDataUrl = await createQrDataUrl(developmentCheckout.paymentPayload);
      return (
        <main className="site-shell subpage-shell">
          <CheckoutClient
            initialOrder={developmentCheckout.order}
            projectName={developmentCheckout.project?.name ?? "Project"}
            networkLabel={developmentCheckout.network.label}
            tokenStandard={developmentCheckout.network.tokenStandard}
            paymentPayload={developmentCheckout.paymentPayload}
            qrDataUrl={qrDataUrl}
            warning={developmentCheckout.network.warning}
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
        networkLabel={network.label}
        tokenStandard={network.tokenStandard}
        paymentPayload={paymentPayload}
        qrDataUrl={qrDataUrl}
        warning={warningForNetwork(network.label)}
      />
    </main>
  );
}
