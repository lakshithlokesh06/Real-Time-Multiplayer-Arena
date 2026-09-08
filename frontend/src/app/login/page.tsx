import { AuthGate } from "@/components/auth-gate";
import { AuthForm } from "@/components/auth-form";
export const metadata = { title: "Login" };
export default function Login() { return <AuthGate guest><AuthForm /></AuthGate>; }
