export const metadata = {
  title: "Privacy",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="site-shell subpage-shell legal-page">
      <p className="eyebrow">PRIVACY</p>
      <h1>Editable privacy notice</h1>
      <p>This page is a product placeholder for privacy review before production launch.</p>
      <section>
        <h2>Data collected</h2>
        <p>Project submissions, payment order metadata, verified transaction evidence, click events, administrative actions, and security logs may be stored to operate the leaderboard and prevent abuse.</p>
      </section>
      <section>
        <h2>Payment privacy</h2>
        <p>Public blockchain transactions are visible on-chain. The application should not expose payer personal information in public bid history.</p>
      </section>
      <section>
        <h2>Contact placeholder</h2>
        <p>Insert reviewed privacy contact and retention details here before production launch.</p>
      </section>
    </main>
  );
}
