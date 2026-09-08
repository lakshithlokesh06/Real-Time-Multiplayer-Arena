import Link from "next/link";
const features = [
 ["01", "Real-Time Multiplayer", "Share the arena. See every move as it happens."],
 ["02", "Competitive Arena Combat", "Make your move. Master timing, positioning, and attacks."],
 ["03", "Matchmaking", "Find your next challenge in public or private matches."],
 ["04", "Leaderboards", "Track your progress and climb the ranks."],
];
export default function Home() {
 return <main id="main"><section className="hero"><div className="eyebrow"><span className="status-dot" /> IN DEVELOPMENT <span className="muted">/</span> PHASE 01</div><p className="overline">REAL-TIME MULTIPLAYER ARENA</p><h1>One arena.<br/>Every move <em>matters.</em></h1><p className="hero-copy">Fast matches. Fierce competition. A real-time multiplayer battleground where your next move makes the difference.</p><div className="actions"><Link className="button primary" href="/play">Play Now <span aria-hidden="true">↗</span></Link><Link className="button secondary" href="#features">Learn More <span aria-hidden="true">↓</span></Link></div><p className="availability">The arena is taking shape. Gameplay is coming in a future release.</p><div className="hero-rule"><span>BUILT FOR THE NEXT MATCH</span><span>01 — FOUNDATION</span></div></section><section id="features" className="features"><div className="section-title"><div><p className="eyebrow">THE ROAD AHEAD</p><h2>A new place to compete.</h2></div><span className="pill">Planned features</span></div><div className="feature-grid">{features.map(([number,title,description])=><article key={number}><span className="feature-number">{number} <span aria-hidden="true">↗</span></span><h3>{title}</h3><p>{description}</p></article>)}</div></section></main>;
}
