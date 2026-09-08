import Link from "next/link";
export function PlaceholderPage({title, description}: {title: string; description: string}) {
 return <main id="main" className="placeholder"><p className="eyebrow">COMING IN A FUTURE PHASE</p><h1>{title}</h1><p>{description}</p><Link className="button secondary" href="/">Back to home <span aria-hidden="true">↗</span></Link></main>;
}
