import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Credits & Sources — Super Bash Folds",
  description: "Artists, source packs, licenses, and provenance for the open assets used by Super Bash Folds.",
};

type Credit = {
  asset: string;
  creator: string;
  creditLabel?: string;
  note?: string;
  pack: string;
  sources: { label: string; href: string }[];
  license?: string;
};

const cc0 = "CC0 1.0";

const fighters: Credit[] = [
  { asset: "Cactus", creator: "Quaternius", pack: "Cute Animated Monsters", sources: [{ label: "Original pack", href: "https://quaternius.com/packs/cutemonsters.html" }] },
  { asset: "Dark Knight 2D", creator: "comphonia", pack: "Dark Knight 2D Character Sprites", sources: [{ label: "OpenGameArt", href: "https://opengameart.org/content/dark-knight-2d-character-sprites" }] },
  { asset: "George", creator: "Quaternius", pack: "Animated Mech", sources: [{ label: "Original pack", href: "https://quaternius.com/packs/animatedmech.html" }] },
  { asset: "Hormelz Knight", creator: "Hormelz", pack: "8-Directional Knight", sources: [{ label: "itch.io", href: "https://hormelz.itch.io/8-directional-knight" }] },
  { asset: "Hormelz Melee Character", creator: "Hormelz", pack: "8-Directional Melee Character", sources: [{ label: "itch.io", href: "https://hormelz.itch.io/8-directional-melee-character" }] },
  { asset: "KayKit Knight", creator: "Kay Lousberg", pack: "KayKit Adventurers + Character Animations 1.1", sources: [{ label: "Character model", href: "https://kaylousberg.itch.io/kaykit-adventurers" }, { label: "Animations", href: "https://kaylousberg.itch.io/kaykit-character-animations" }] },
  { asset: "Kenney Toon Adventurer", creator: "Kenney", pack: "Toon Characters", sources: [{ label: "Original pack", href: "https://kenney.nl/assets/toon-characters" }] },
  { asset: "Knight Hero", creator: "PixiVan", pack: "Knight Hero Platformer Animation Pack", sources: [{ label: "OpenGameArt", href: "https://opengameart.org/content/knight-hero-platformer-animation-pack" }] },
  { asset: "Platformer", creator: "Quaternius", pack: "Ultimate Platformer", sources: [{ label: "Original pack", href: "https://quaternius.com/packs/ultimateplatformer.html" }] },
  { asset: "Quaternius Ranger", creator: "Quaternius", pack: "Modular Character Outfits — Fantasy + Universal Animation Libraries 1 & 2", sources: [{ label: "Character model", href: "https://quaternius.com/packs/modularcharacteroutfitsfantasy.html" }, { label: "Animation Library 1", href: "https://quaternius.com/packs/universalanimationlibrary.html" }, { label: "Animation Library 2", href: "https://quaternius.com/packs/universalanimationlibrary2.html" }] },
  { asset: "RGS Character Prototype", creator: "RGS_Dev", pack: "Character Prototype Animated CC0", sources: [{ label: "itch.io", href: "https://rgsdev.itch.io/character-prototype-animated-cc0" }] },
  { asset: "RGS Stick Figure", creator: "RGS_Dev", pack: "Animated Stick Figure Character 2D", sources: [{ label: "itch.io", href: "https://rgsdev.itch.io/animated-stick-figure-character-2d-free-cc0" }] },
  { asset: "Wolf", creator: "Quaternius", pack: "Ultimate Animated Animals", sources: [{ label: "Original pack", href: "https://quaternius.com/packs/ultimateanimatedanimals.html" }] },
  { asset: "Yeti", creator: "Quaternius", pack: "Cute Animated Monsters", sources: [{ label: "Original pack", href: "https://quaternius.com/packs/cutemonsters.html" }] },
].map((credit) => ({ ...credit, license: cc0 }));

const otherAssets: Credit[] = [
  { asset: "Verdant Grove stage", creator: "RGS_Dev", creditLabel: "Source artwork by", pack: "Free Vector Grass Tileset", sources: [{ label: "OpenGameArt", href: "https://opengameart.org/content/free-vector-grass-tileset" }], license: cc0 },
  { asset: "Impacts, movement, menu and countdown sounds", creator: "Kenney", creditLabel: "Audio by", pack: "Impact Sounds + Interface Sounds", sources: [{ label: "Impact Sounds", href: "https://kenney.nl/assets/impact-sounds" }, { label: "Interface Sounds", href: "https://kenney.nl/assets/interface-sounds" }], license: cc0 },
  { asset: "Match-state jingles", creator: "Kenney", creditLabel: "Audio by", pack: "Music Jingles", sources: [{ label: "Music Jingles", href: "https://kenney.nl/assets/music-jingles" }], license: cc0 },
  { asset: "Menu and battle music", creator: "qubodup", creditLabel: "Audio by", pack: "Two Simple Game Music Loops", sources: [{ label: "OpenGameArt", href: "https://opengameart.org/content/two-simple-game-music-loops" }], license: cc0 },
];

const projectCreatedWork: Credit[] = [
  {
    asset: "Original item icons",
    creator: "GPT-5.6-Sol",
    creditLabel: "Created with",
    note: "20 original SVG icons, directed and reviewed by Swarek.",
    pack: "Original project artwork",
    sources: [
      { label: "View files on GitHub", href: "https://github.com/Swarek/Super-Open-Bros/tree/main/public/assets/open/items" },
    ],
    license: cc0,
  },
  {
    asset: "Interface cursors",
    creator: "GPT-5.6-Sol",
    creditLabel: "Created with",
    note: "Original pointer and grab cursors, directed and reviewed by Swarek.",
    pack: "Original project artwork",
    sources: [
      { label: "View files on GitHub", href: "https://github.com/Swarek/Super-Open-Bros/tree/main/public/assets/open/ui" },
    ],
    license: cc0,
  },
  {
    asset: "Brand icon",
    creator: "GPT-5.6-Sol",
    creditLabel: "Created with",
    note: "Original SVG identity mark, directed and reviewed by Swarek.",
    pack: "Original project artwork",
    sources: [
      { label: "View file on GitHub", href: "https://github.com/Swarek/Super-Open-Bros/blob/main/public/favicon.svg" },
    ],
    license: cc0,
  },
];

function CreditCard({ credit }: { credit: Credit }) {
  return (
    <article className="credit-card">
      <div>
        <p className="credit-kind">{credit.pack}</p>
        <h3>{credit.asset}</h3>
        <p>{credit.creditLabel ?? "Art and animation by"} <strong>{credit.creator}</strong></p>
        {credit.note ? <p className="credit-note">{credit.note}</p> : null}
      </div>
      <div className="credit-links">
        {credit.sources.map((source) => (
          <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
            {source.label} <span aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
      <a className="license-pill" href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">
        {credit.license ?? cc0}
      </a>
    </article>
  );
}

export default function Credits() {
  return (
    <main className="credits-page">
      <header className="credits-header">
        <a className="brand" href="/" aria-label="Super Bash Folds — home">
          <span className="brand-mark" aria-hidden="true"><i /><b /></span>
          <span><strong>Super Bash</strong><em>Folds</em></span>
        </a>
        <a className="header-cta" href="/play/index.html">Play now <span aria-hidden="true">→</span></a>
      </header>

      <section className="credits-hero">
        <p className="eyebrow light"><span /> Thank you to the artists</p>
        <h1>Credits<br /><em>&amp; sources.</em></h1>
        <p>Super Bash Folds exists because artists share their work. Every open asset shipped with the game is linked below so you can discover, support, and credit its creator.</p>
      </section>

      <section className="credits-section" aria-labelledby="fighter-credits">
        <div className="credits-heading">
          <p>01</p>
          <div><h2 id="fighter-credits">Fighters</h2><p>Character art, models, sprites, and animation packs used by the open roster.</p></div>
        </div>
        <div className="credits-grid">{fighters.map((credit) => <CreditCard key={credit.asset} credit={credit} />)}</div>
      </section>

      <section className="credits-section credits-section-alt" aria-labelledby="world-credits">
        <div className="credits-heading">
          <p>02</p>
          <div><h2 id="world-credits">Stage, audio &amp; interface</h2><p>The world around the fighters, from the arena to every impact and menu cue.</p></div>
        </div>
        <div className="credits-grid">{otherAssets.map((credit) => <CreditCard key={credit.asset} credit={credit} />)}</div>
      </section>

      <section className="credits-section" aria-labelledby="project-credits">
        <div className="credits-heading">
          <p>03</p>
          <div><h2 id="project-credits">Created for the project</h2><p>Original work made with GPT-5.6-Sol is labeled explicitly and linked to its source on GitHub.</p></div>
        </div>
        <div className="credits-grid">{projectCreatedWork.map((credit) => <CreditCard key={credit.asset} credit={credit} />)}</div>
      </section>

      <section className="credits-note">
        <div><p className="eyebrow"><span /> Provenance matters</p><h2>Built open.<br /><em>Credited clearly.</em></h2></div>
        <div>
          <p>These credits come from provenance records shipped in the public repository. Human artists and AI-assisted work are labeled separately. CC0 does not require attribution, but transparent authorship still matters.</p>
          <a className="text-link" href="https://github.com/Swarek/Super-Open-Bros/blob/main/THIRD_PARTY_ASSETS.md" target="_blank" rel="noreferrer">View the full asset manifest <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <footer className="credits-footer">
        <a href="/">← Back to Super Bash Folds</a>
        <a href="/play/index.html">Play now →</a>
      </footer>
    </main>
  );
}
