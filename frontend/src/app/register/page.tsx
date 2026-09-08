import { AuthGate } from "@/components/auth-gate";
import { AuthForm } from "@/components/auth-form";
export const metadata = { title: "Create account" };
export default function Register() { return <AuthGate guest><AuthForm registration /></AuthGate>; }
