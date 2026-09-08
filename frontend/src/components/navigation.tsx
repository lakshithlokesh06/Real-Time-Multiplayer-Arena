import Link from "next/link";
export function Navigation() {
  return <header className="site-header"><Link href="/" className="brand" aria-label="Arena home"><span className="brand-mark" aria-hidden="true">A</span> ARENA<span className="brand-sub"> / MULTIPLAYER</span></Link><nav aria-label="Main navigation"><Link href="/#features">The game</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/play" className="nav-play">Enter arena <span aria-hidden="true">↗</span></Link></nav></header>;
}
