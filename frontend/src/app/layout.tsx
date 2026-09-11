import type { Metadata } from "next";
import { Navigation } from "@/components/navigation";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
export const metadata: Metadata = { title: { default: "Real-Time Multiplayer Arena", template: "%s | Arena" }, description: "A competitive multiplayer arena in development. Built for fast matches and real-time action." };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
 return <html lang="en" data-scroll-behavior="smooth"><body><a href="#main" className="skip-link">Skip to content</a><AuthProvider><div className="shell"><Navigation />{children}<footer><span>REAL-TIME MULTIPLAYER ARENA</span><span>Phase 07 <span aria-hidden="true">/</span> Matchmaking</span></footer></div></AuthProvider></body></html>;
}
