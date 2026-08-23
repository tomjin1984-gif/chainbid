import Link from "next/link";

export const metadata = {
  title: "About",
  description: "The story, purpose, and public payment addresses behind Chain.bid.",
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
          Chain.bid started from a simple idea: in the AI era, even someone who
          knows almost nothing about code can finally express an idea and turn it
          into a real product.
        </p>
      </section>

      <section className="about-story">
        <h2>我的第一个 AI 区块链项目</h2>
        <p>
          我是一个代码一窍不通的新手。过去很多想法只能停留在脑海里，
          但在如今的 AI 时代，我终于可以把自己的想法表达出来，并尝试把它做成一个真正可以被使用的项目。
        </p>
        <p>
          这是我的第一个 AI 区块链项目。我会把这个项目
          <strong> 80% 的收入 </strong>
          用于帮助需要帮助的人和事物。我是一个和平爱好者，希望世界和平，没有灾难。
        </p>
        <p>
          我会公布所有项目收款地址，邀请大家一起来做一件有意义的事情。请加入我们吧。
        </p>
      </section>

      <section className="about-metrics" aria-label="Project principles">
        <div>
          <strong>1st</strong>
          <span>AI blockchain project</span>
        </div>
        <div>
          <strong>80%</strong>
          <span>income for help</span>
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
        <Link className="button" href="/#leaderboard">
          Join us
        </Link>
      </div>
    </main>
  );
}
