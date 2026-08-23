export const metadata = {
  title: "Rules",
  description: "Bidding and ranking rules for chain.bid.",
};

export default function RulesPage() {
  return (
    <main className="site-shell subpage-shell legal-page">
      <p className="eyebrow">RULES</p>
      <h1>Higher verified USDT bids rank higher.</h1>
      <section>
        <h2>Ranking</h2>
        <p>Listings sort by total bid in USDT, descending. Ties are broken by the earlier time the project reached its current total.</p>
        <p>Taking first place requires the current top bid plus 5 USDT. Passing any other position requires that position&apos;s total plus 1 USDT.</p>
      </section>
      <section>
        <h2>Payments</h2>
        <p>Only USDT is accepted. ETH, BNB, SOL, and TRX may be needed for gas but are not bidding currencies.</p>
        <p>Payments are final once confirmed on-chain. Wrong-token, wrong-network, late, underpaid, or ambiguous transfers may require manual review.</p>
      </section>
      <section>
        <h2>Moderation</h2>
        <p>Listings can be hidden for phishing, malware, impersonation, scams, illegal content, trademark complaints, malicious redirects, or other policy violations. Payment history remains auditable.</p>
      </section>
    </main>
  );
}
