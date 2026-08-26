import type { Metadata } from "next";
import { ManualTransactionCheckForm } from "@/components/manual-transaction-check-form";

export const metadata: Metadata = {
  title: "Manual Transaction Check",
  description:
    "Check a blockchain transaction hash against pending Chain.bid payment orders.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ManualTransactionCheckPage() {
  return (
    <main className="site-shell subpage-shell">
      <section className="manual-check-page">
        <div className="manual-check-hero">
          <p className="eyebrow">MANUAL TRANSACTION CHECK</p>
          <h1>Check a payment.</h1>
          <p>
            Paste a transaction hash to match it against pending submissions or boosts.
            The server checks the chain, receiver, token, amount, and confirmation status.
          </p>
        </div>
        <ManualTransactionCheckForm />
      </section>
    </main>
  );
}
