import type { Metadata } from "next";
import { Navigation } from "@/components/navigation";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Real-Time Multiplayer Arena", template: "%s | Arena" }, description: "A competitive multiplayer arena in development. Built for fast matches and real-time action." };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
 return <html lang="en"><body><a href="#main" className="skip-link">Skip to content</a><div className="shell"><Navigation />{children}<footer><span>REAL-TIME MULTIPLAYER ARENA</span><span>Phase 01 <span aria-hidden="true">/</span> Foundation</span></footer></div></body></html>;
}
