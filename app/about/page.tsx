/* eslint-disable @next/next/no-html-link-for-pages -- Public Sites navigation must work without client router hydration. */
export const metadata = {
  title: "About",
  description: "The purpose, giving commitment, and public payment addresses behind Chain.bid.",
};

const publicAddresses = [
  {
    network: "TRX",
    address: "TXCeQc8ekY2M1xE6DkH9QaHwq4VLK7Vf79",
  },
  {
    network: "ETH",
    address: "0x64182691a520444f9caaf9dcf5bf50e002b42413",
  },
  {
    network: "BNB",
    address: "0x64182691a520444f9caaf9dcf5bf50e002b42413",
  },
  {
    network: "SOL",
    address: "DF3GhEBESpTcLbXuKWyFxYPL9PD66CzQNGK4smFg7ew3",
  },
];

export default function AboutPage() {
  return (
    <main className="site-shell subpage-shell about-page">
      <section className="about-hero">
        <p className="eyebrow">ABOUT</p>
        <h1>About</h1>
        <p>
          Chain.bid was inspired by the philosophy behind Outbid.lol: in the age
          of artificial intelligence, even people with little or no coding
          experience can express their creativity and turn ideas into real
          products.
        </p>
      </section>

      <section className="about-story">
        <h2>Built with AI. Guided by purpose.</h2>
        <p>
          Chain.bid exists to show that creativity should not be limited by
          technical background. With AI, an idea can move from imagination to a
          working product, even for someone who is just beginning.
        </p>
        <p>
          <strong>80% of the project&apos;s revenue</strong> will be dedicated to
          humanitarian aid and meaningful causes. Our hope is a peaceful world,
          free from war and disaster.
        </p>
        <p>
          All payment addresses are publicly available. We invite everyone to
          join us in doing something meaningful.
        </p>
      </section>

      <section className="about-metrics" aria-label="Project principles">
        <div>
          <strong>1st</strong>
          <span>AI-built blockchain project</span>
        </div>
        <div>
          <strong>80%</strong>
          <span>revenue for aid</span>
        </div>
        <div>
          <strong>4</strong>
          <span>public payment addresses</span>
        </div>
      </section>

      <section className="about-addresses" aria-label="Public payment addresses">
        <div className="about-section-heading">
          <h2>Public payment addresses</h2>
          <p>All listed addresses are public so everyone can inspect where project payments are collected.</p>
        </div>

        <div className="address-grid">
          {publicAddresses.map((item) => (
            <div className="address-card" key={item.network}>
              <span>{item.network}</span>
              <code>{item.address}</code>
            </div>
          ))}
        </div>
      </section>

      <div className="about-join">
        <a className="button" href="/#leaderboard">
          Join us
        </a>
      </div>
    </main>
  );
}
