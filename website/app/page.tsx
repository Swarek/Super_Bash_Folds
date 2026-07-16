const fighters = [
  { name: "Cactus", image: "/media/fighters/cactus.png", className: "fighter-coral" },
  { name: "Toon", image: "/media/fighters/kenney-toon.png", className: "fighter-sky" },
  { name: "Hero", image: "/media/fighters/quaternius-hero.png", className: "fighter-cream" },
  { name: "Stick", image: "/media/fighters/rgs-stick.png", className: "fighter-violet" },
  { name: "Wolf", image: "/media/fighters/wolf.png", className: "fighter-mint" },
  { name: "Yeti", image: "/media/fighters/yeti.png", className: "fighter-blue" },
] as const;

const features = [
  {
    number: "01",
    title: "Fast by design",
    copy: "Responsive movement, short and full hops, dodges, shields, grabs, and ledge play designed to keep you in control.",
  },
  {
    number: "02",
    title: "Made to be modded",
    copy: "Every fighter and stage is a standalone pack. Define it, add its assets, run validation, and it joins the game.",
  },
  {
    number: "03",
    title: "Open by default",
    copy: "MIT-licensed code, documented assets, and public pipelines. Study, modify, fork, and share your own version.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Super Bash Folds — home">
          <span className="brand-mark" aria-hidden="true"><i /><b /></span>
          <span><strong>Super Bash</strong><em>Folds</em></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#game">The game</a>
          <a href="#create">Create</a>
          <a href="#open-source">Open source</a>
          <a href="/credits">Credits</a>
        </nav>
        <a className="header-cta" href="/play/index.html">
          Play now <span aria-hidden="true">→</span>
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow"><span /> The community-built platform fighter</p>
          <h1><span>Super</span><span>Bash</span><span className="fold-word">Folds<i /></span></h1>
          <p className="hero-intro">
            Enter the arena, launch your rivals off the stage, and reshape the game your way.
            Every fighter, every stage, and every idea can become a new fold.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/play/index.html">Play now <span aria-hidden="true">→</span></a>
            <a className="button button-ghost" href="#create">Create a fighter</a>
          </div>
          <div className="hero-meta" aria-label="Key features">
            <span><strong>2</strong> local players</span>
            <span><strong>14</strong> open fighters</span>
            <span><strong>MIT</strong> source code</span>
          </div>
        </div>

        <div className="hero-arena" aria-label="Super Bash Folds fighter preview">
          <div className="impact-word" aria-hidden="true">BASH!</div>
          <div className="arena-platform platform-back" aria-hidden="true" />
          <div className="fighter-card fighter-card-main">
            <span>PLAYER 1</span>
            <img src="/media/fighters/quaternius-hero.png" alt="Hero fighter" />
          </div>
          <div className="fighter-card fighter-card-rival">
            <span>PLAYER 2</span>
            <img src="/media/fighters/cactus.png" alt="Cactus fighter" />
          </div>
          <div className="arena-platform platform-front" aria-hidden="true"><i /></div>
          <div className="motion-line line-one" aria-hidden="true" />
          <div className="motion-line line-two" aria-hidden="true" />
        </div>
      </section>

      <section className="manifesto" id="game">
        <p>We do not need to copy someone else&apos;s world.</p>
        <h2>We build<br />our own.</h2>
        <div className="manifesto-note">
          <span>FIGHT</span><span>CREATE</span><span>SHARE</span>
        </div>
      </section>

      <section className="roster-section" aria-labelledby="roster-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> A roster waiting for your next move</p>
            <h2 id="roster-title">Pick. Fight.<br /><em>Run it back.</em></h2>
          </div>
          <p>Heroes, creatures, and even a stick figure. Style is never a limit when the gameplay delivers.</p>
        </div>
        <div className="fighter-grid">
          {fighters.map((fighter, index) => (
            <article className={`roster-card ${fighter.className}`} key={fighter.name}>
              <span className="roster-index">{String(index + 1).padStart(2, "0")}</span>
              <img src={fighter.image} alt={`${fighter.name} portrait`} />
              <h3>{fighter.name}</h3>
              <span className="card-fold" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="feature-section" id="open-source">
        <div className="feature-intro">
          <p className="eyebrow light"><span /> One engine, endless directions</p>
          <h2>The fight belongs<br /><em>to its creators.</em></h2>
        </div>
        <div className="feature-list">
          {features.map((feature) => (
            <article key={feature.number}>
              <span>{feature.number}</span>
              <div><h3>{feature.title}</h3><p>{feature.copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="create-section" id="create">
        <div className="stage-preview">
          <img src="/media/verdant-grove.png" alt="The open-source Verdant Grove stage" />
          <div className="stage-label"><span>STAGE 01</span><strong>Verdant Grove</strong><em>CC0</em></div>
        </div>
        <div className="create-copy">
          <p className="eyebrow"><span /> Build your own stage</p>
          <h2>Your idea.<br />Your rules.<br /><em>Your fold.</em></h2>
          <p>Stage packs keep collisions, platforms, blast zones, spawn points, rendering, and licensing together in one clear folder.</p>
          <a className="text-link" href="https://github.com/Swarek/Super-Open-Bros/blob/main/stages/README.md" target="_blank" rel="noreferrer">
            Read the stage guide <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="quickstart" id="quickstart">
        <div>
          <p className="eyebrow light"><span /> Ready in a few commands</p>
          <h2>Fork.<br />Build.<br /><em>Bash.</em></h2>
        </div>
        <div className="terminal-card">
          <div className="terminal-bar"><i /><i /><i /><span>super-bash-folds — zsh</span></div>
          <pre><code><span>$</span> git clone https://github.com/Swarek/Super-Open-Bros.git{"\n"}<span>$</span> cd Super-Open-Bros{"\n"}<span>$</span> npm ci{"\n"}<span>$</span> npm run dev</code></pre>
          <p>Node.js 20+ · macOS, Windows, and Linux</p>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark" aria-hidden="true"><i /><b /></span>
          <span><strong>Super Bash</strong><em>Folds</em></span>
        </a>
        <p>An independent, open-source platform fighter.<br />Not affiliated with or endorsed by any video game publisher.</p>
        <div><a href="/play/index.html">Play now →</a><a href="https://github.com/Swarek/Super-Open-Bros" target="_blank" rel="noreferrer">GitHub ↗</a><a href="#create">Documentation</a><a href="/credits">Credits &amp; sources</a><a href="#top">Back to top ↑</a></div>
      </footer>
    </main>
  );
}
