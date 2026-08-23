/* eslint-disable @next/next/no-html-link-for-pages -- Public Sites navigation must work without client router hydration. */
export const metadata = {
  title: "About",
  description: "The AI-powered purpose and humanitarian mission behind Chain.bid.",
};

export default function AboutPage() {
  return (
    <main className="site-shell subpage-shell about-page">
      <section className="about-hero">
        <p className="eyebrow">ABOUT</p>
        <h1>About</h1>
        <p>
          Chain.bid is powered by artificial intelligence and guided by a
          higher purpose.
        </p>
      </section>

      <section className="about-story">
        <h2>Built with AI. Guided by purpose.</h2>
        <p>
          Chain.bid exists to prove that creativity should not be limited by
          technical background. With AI, even beginners can turn ideas
          from imagination into real products.
        </p>
        <p>
          A portion of the project&apos;s revenue will be dedicated to humanitarian
          aid and meaningful causes. We hope for a peaceful world, free from war
          and disaster.
        </p>
        <p>
          We invite everyone to join us and take part in something meaningful.
        </p>
      </section>

      <section className="about-metrics" aria-label="Project principles">
        <div>
          <strong>AI</strong>
          <span>powered creativity</span>
        </div>
        <div>
          <strong>Aid</strong>
          <span>humanitarian causes</span>
        </div>
        <div>
          <strong>Peace</strong>
          <span>world without war</span>
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
