export const metadata = {
  title: "Terms",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="site-shell subpage-shell legal-page">
      <p className="eyebrow">TERMS</p>
      <h1>Editable launch terms</h1>
      <p>This page is a product placeholder for legal review before production launch. Do not treat it as jurisdiction-specific legal advice.</p>
      <section>
        <h2>Paid ranking</h2>
        <p>Projects pay USDT to compete for visibility. Ranking is based on verified bid totals and the published tie-break rule.</p>
      </section>
      <section>
        <h2>Finality and mistakes</h2>
        <p>Blockchain transactions generally cannot be reversed by the application. Users are responsible for verifying the selected network, token, receiver, and amount before sending funds.</p>
      </section>
      <section>
        <h2>Refund policy placeholder</h2>
        <p>Insert reviewed refund/no-refund policy here before enabling mainnet payments.</p>
      </section>
    </main>
  );
}
