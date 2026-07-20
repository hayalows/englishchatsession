import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">BYU–Pathway</p>
        <h1>English Chat Monitor</h1>
        <p className="lede">Sign in with a private magic link to check appointments and open their booking pages.</p>
        <LoginForm />
      </section>
    </main>
  );
}
