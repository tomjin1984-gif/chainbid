import Link from "next/link";

export const metadata = {
  title: "Rules",
  description: "Bidding, payment safety, risk warnings, and disclaimer for chain.bid.",
};

export default function RulesPage() {
  return (
    <main className="site-shell subpage-shell legal-page rules-page">
      <header className="rules-hero">
        <p className="eyebrow">RULES</p>
        <h1>Rules</h1>
        <p>
          chain.bid is a public crypto leaderboard. There are no ads, no ranking
          promises, and no investment recommendations. Projects pay verified
          USDT bids to stand higher on the board. Rank is the credited bid total,
          nothing else.
        </p>
      </header>

      <section>
        <h2>How ranking works</h2>
        <ul>
          <li>New listings are whole USDT bids, 5 USDT minimum, 999,999 USDT maximum, and 1 USDT increments.</li>
          <li>Taking #1 costs at least 5 USDT more than the current top bid. Paying less can still place you on the board at the rank your bid can reach.</li>
          <li>Passing any other rank requires at least 1 USDT more than that position&apos;s credited total.</li>
          <li>Equal totals keep the older ranking timestamp higher. The listing that reached the total first stays ahead.</li>
          <li>Boosting an existing listing uses the same website URL and only requires paying the difference needed for the target rank.</li>
        </ul>
      </section>

      <section>
        <h2>What you can list</h2>
        <ul>
          <li>A public crypto, Web3, token, protocol, product, app, wallet, exchange, infrastructure, NFT, gaming, social, or related project website.</li>
          <li>Submitted URLs are normalized. Tracking parameters, fragments, and obvious referral strings may be ignored.</li>
          <li>Phishing, malware, impersonation, fake airdrops, scam pages, illegal content, and trademark-abusive listings are not allowed.</li>
          <li>Private invite links, short-link redirects, wallet drainers, adult content, and pages that hide the real destination may be removed.</li>
        </ul>
      </section>

      <section>
        <h2>Payment rules</h2>
        <ul>
          <li>Only USDT is accepted. Gas tokens such as TRX, ETH, BNB, or SOL may be needed by your wallet, but they do not count as bids.</li>
          <li>Send the exact amount shown on the checkout page, on the exact network shown. The extra decimal amount helps the server match your payment.</li>
          <li>A pasted transaction hash only triggers an independent check. It does not credit the bid unless the server verifies the chain, token, receiver, amount, finality, and duplicate-use status.</li>
          <li>Wrong-network, wrong-token, wrong-address, underpaid, late, duplicate, or ambiguous transfers may not be credited.</li>
          <li>Credited blockchain payments are final. Refunds are not guaranteed and may be impossible when funds are sent incorrectly.</li>
        </ul>
      </section>

      <section>
        <h2>Security risk warning</h2>
        <ul>
          <li>Always verify the domain, payment network, receiver address, and exact amount before sending USDT.</li>
          <li>Check that the address shown in your wallet or exchange withdrawal screen matches the checkout page. Do not rely only on a copied clipboard value.</li>
          <li>Beware of fake sites, browser extensions, malware, DNS attacks, and clipboard hijackers that can replace payment addresses.</li>
          <li>chain.bid does not need token approvals to receive bids. Do not approve unlimited USDT spending for a site claiming to be chain.bid.</li>
          <li>If anything looks different from the checkout screen, stop and do not send funds.</li>
        </ul>
      </section>

      <section>
        <h2>Moderation</h2>
        <ul>
          <li>Listings can be hidden, renamed, recategorized, or removed for security, legal, abuse, quality, or policy reasons.</li>
          <li>Removing a listing from public display does not imply that an on-chain payment can be reversed.</li>
          <li>Click counts, categories, descriptions, icons, and metadata may be corrected to reduce spam or abuse.</li>
        </ul>
      </section>

      <section>
        <h2>Disclaimer</h2>
        <ul>
          <li>chain.bid is a visibility leaderboard, not a broker, exchange, investment adviser, escrow service, payment processor, or endorsement platform.</li>
          <li>A high rank does not mean a project is safe, legitimate, audited, profitable, or recommended.</li>
          <li>Users are responsible for their own due diligence, wallet security, tax obligations, legal compliance, and transaction decisions.</li>
          <li>Blockchain transactions can be irreversible. Use the site only if you understand the risk of permanent loss.</li>
          <li>These rules are operational terms and safety guidance, not legal, financial, tax, or investment advice.</li>
        </ul>
      </section>

      <div className="footer-links rules-footer">
        <span>chain.bid</span>
        <span>·</span>
        <Link href="/#leaderboard">Live stats</Link>
        <span>·</span>
        <Link href="/categories">Categories</Link>
      </div>
    </main>
  );
}
