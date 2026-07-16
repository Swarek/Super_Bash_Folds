/* eslint-disable @next/next/no-img-element -- Static pack art is already optimized and must stay deployable without an image-optimizer runtime. */

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

const contributionPaths = [
  {
    title: "Artists & animators",
    copy: "Help create the first flagship original fighter and replace adapted clips with purpose-built animation.",
  },
  {
    title: "Developers & designers",
    copy: "Improve pack tooling, competitive balance, accessibility, controller support, and engine mechanics.",
  },
  {
    title: "Players & testers",
    copy: "Test movement, matchups, controllers, and rules, then turn what feels wrong into reproducible feedback.",
  },
] as const;

const repositoryUrl = "https://github.com/Swarek/Super_Bash_Folds";

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
          <a href="#contribute">Contribute</a>
          <a href="#open-source">Open source</a>
          <a href="/credits">Credits</a>
        </nav>
        <div className="header-actions">
          <a className="header-github" href={repositoryUrl} target="_blank" rel="noreferrer">
            GitHub <span aria-hidden="true">★</span>
          </a>
          <a className="header-cta" href="/play/index.html">
            Play now <span aria-hidden="true">→</span>
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow"><span /> The open platform-fighter engine</p>
          <h1><span>Super</span><span>Bash</span><span className="fold-word">Folds<i /></span></h1>
          <p className="hero-intro">
            Fight locally in the browser, then reshape the game. Fighters and stages are
            portable packs built for artists, modders, developers, and competitive players.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/play/index.html">Play the demo <span aria-hidden="true">→</span></a>
            <a className="button button-ghost" href={repositoryUrl} target="_blank" rel="noreferrer">View on GitHub <span aria-hidden="true">★</span></a>
          </div>
          <a className="hero-create-link" href={`${repositoryUrl}/blob/main/fighters/README.md`} target="_blank" rel="noreferrer">
            Build a fighter from a pack <span aria-hidden="true">↗</span>
          </a>
          <div className="hero-meta" aria-label="Key features">
            <span><strong>14</strong> open fighters</span>
            <span><strong>1</strong> CC0 stage</span>
            <span><strong>MIT</strong> source code</span>
          </div>
        </div>

        <div className="hero-gameplay" aria-label="Gameplay from the public open-source build">
          <video autoPlay muted loop playsInline poster="/media/gameplay-poster.webp">
            <source src="/media/gameplay.webm" type="video/webm" />
          </video>
          <div className="gameplay-caption"><strong>Real browser gameplay</strong><small>Keyboard · Controllers · Local versus · CPU</small></div>
        </div>
      </section>

      <aside className="public-note" aria-label="Public content notice">
        <strong>100% redistributable public build.</strong>
        <span>Third-party franchise characters shown in early private development footage are not included in the demo or repository.</span>
      </aside>

      <section className="manifesto" id="game">
        <p>We do not need to copy someone else&apos;s world.</p>
        <h2>We build<br />our own.</h2>
        <div className="manifesto-note">
          <span>FIGHT</span><span>CREATE</span><span>SHARE</span>
        </div>
      </section>

      <section className="mission-section" id="contribute" aria-labelledby="mission-title">
        <div className="open-slot" aria-hidden="true">
          <span>ROSTER SLOT 15</span>
          <strong>YOUR<br />FIGHTER</strong>
          <i>+</i>
        </div>
        <div className="mission-copy">
          <p className="eyebrow"><span /> The next fighter is a community project</p>
          <h2 id="mission-title">Help build the first<br /><em>flagship original.</em></h2>
          <p>
            The engine is playable. What it needs now is a memorable original roster with
            complete animation sets, coherent move design, and competitive counterplay.
          </p>
          <div className="mission-actions">
            <a className="button button-dark" href={`${repositoryUrl}/issues?q=is%3Aissue+state%3Aopen+label%3A%22good+first+issue%22`} target="_blank" rel="noreferrer">Good first issues <span aria-hidden="true">↗</span></a>
            <a className="text-link" href={`${repositoryUrl}/discussions`} target="_blank" rel="noreferrer">Share an idea <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="contribution-list">
          {contributionPaths.map((path) => (
            <article key={path.title}><h3>{path.title}</h3><p>{path.copy}</p></article>
          ))}
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
          <p className="eyebrow"><span /> Add content without editing the registry</p>
          <h2>Your fighter.<br />Your stage.<br /><em>Your fold.</em></h2>
          <p>Portable packs keep gameplay, animation, rendering, provenance, and licensing together in one clear folder.</p>
          <div className="create-links">
            <a className="text-link" href={`${repositoryUrl}/blob/main/fighters/README.md`} target="_blank" rel="noreferrer">
              Build a fighter <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href={`${repositoryUrl}/blob/main/stages/README.md`} target="_blank" rel="noreferrer">
              Build a stage <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <section className="quickstart" id="quickstart">
        <div>
          <p className="eyebrow light"><span /> Ready in a few commands</p>
          <h2>Fork.<br />Build.<br /><em>Bash.</em></h2>
        </div>
        <div className="terminal-card">
          <div className="terminal-bar"><i /><i /><i /><span>super-bash-folds — zsh</span></div>
          <pre><code><span>$</span> git clone https://github.com/Swarek/Super_Bash_Folds.git{"\n"}<span>$</span> cd Super_Bash_Folds{"\n"}<span>$</span> npm ci{"\n"}<span>$</span> npm run dev</code></pre>
          <p>Node.js 20.19+ or 22.12+ · macOS, Windows, and Linux</p>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark" aria-hidden="true"><i /><b /></span>
          <span><strong>Super Bash</strong><em>Folds</em></span>
        </a>
        <p>An independent, open-source platform fighter.<br />Not affiliated with or endorsed by any video game publisher.</p>
        <div><a href="/play/index.html">Play now →</a><a href={repositoryUrl} target="_blank" rel="noreferrer">GitHub ★</a><a href={`${repositoryUrl}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">Contribute ↗</a><a href="/credits">Credits &amp; sources</a><a href="#top">Back to top ↑</a></div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Super Bash Folds",
            applicationCategory: "GameApplication",
            operatingSystem: "Web",
            url: "https://super-bash-folds.spry-crumb-3668.chatgpt.site/",
            codeRepository: repositoryUrl,
            license: "https://opensource.org/license/mit",
            isAccessibleForFree: true,
          }),
        }}
      />
    </main>
  );
}
