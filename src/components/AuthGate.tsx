import {
  AuthError,
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange,
  signup,
  type User,
} from "@netlify/identity";
import { Cloud, Loader2, LockKeyhole } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import jaytech from "@/assets/jaytech.png";

interface AuthGateProps {
  children: (user: User, signOut: () => Promise<void>) => ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [verifying, setVerifying] = useState(false);

  const sendVerification = useCallback(async () => {
    setError("");
    setMessage("");
    const response = await fetch("/api/auth/send-verification", { method: "POST" });
    const body = (await response.json().catch(() => ({}))) as {
      sent?: boolean;
      verified?: boolean;
      error?: string;
    };
    if (body.verified) setVerified(true);
    else if (response.ok) {
      setMessage("We sent a 6-digit code to your email. Check your inbox and spam folder.");
      setCooldown(60);
    } else {
      setError(body.error ?? "Could not send the code. Try again.");
      if (response.status === 429) setCooldown(60);
    }
  }, []);

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifying(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        verified?: boolean;
        error?: string;
      };
      if (body.verified) setVerified(true);
      else setError(body.error ?? "Could not verify the code. Try again.");
    } finally {
      setVerifying(false);
    }
  };

  // Whenever a user is signed in, find out whether their email is verified yet.
  useEffect(() => {
    if (!user) {
      setVerified(null);
      setCode("");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/status", { cache: "no-store" });
        const body = response.ok
          ? ((await response.json()) as { verified: boolean; codeSent: boolean })
          : null;
        if (!active) return;
        setVerified(body?.verified ?? false);
        if (!body) setError("Could not check your account. Try signing out and in again.");
        else if (!body.verified && !body.codeSent) await sendVerification();
      } catch {
        if (active) setVerified(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, sendVerification]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthChange((_event, nextUser) => {
      if (active) setUser(nextUser);
    });

    void (async () => {
      try {
        await handleAuthCallback();
        const currentUser = await getUser();
        if (active) setUser(currentUser);
      } catch {
        if (active) setUser(await getUser());
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      if (mode === "login") {
        setUser(await login(email.trim(), password));
      } else {
        const created = await signup(email.trim(), password, { full_name: name.trim() });
        const currentUser = await getUser();
        if (currentUser) {
          setUser(currentUser);
        } else {
          setMessage(
            `Check ${created.email ?? email.trim()} to confirm your account, then sign in.`,
          );
          setMode("login");
          setPassword("");
        }
      }
    } catch (caught) {
      setError(
        caught instanceof AuthError ? caught.message : "Authentication failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> Securing your workspace…
      </div>
    );
  }

  if (user && verified === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> Checking your account…
      </div>
    );
  }

  if (user && verified) return children(user, signOut);

  if (user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[oklch(0.105_0.022_255)] px-5 py-10 text-foreground">
        <section className="w-full max-w-md rounded-2xl border border-border bg-[oklch(0.14_0.025_255)] p-8 text-center shadow-2xl">
          <img
            src={jaytech}
            alt="JayCode"
            className="mx-auto h-12 w-12 rounded-xl border border-primary/60 object-cover"
          />
          <h1 className="mt-5 text-2xl font-semibold">Verify your email</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Enter the 6-digit code we sent to{" "}
            <strong className="text-foreground">{user.email}</strong>.
          </p>
          <form onSubmit={submitCode} className="mt-6">
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              className="h-12 w-full rounded-md border border-border bg-background text-center text-2xl font-semibold tracking-[0.5em] text-foreground outline-none transition focus:border-primary"
              placeholder="······"
            />
            {error && (
              <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {message && (
              <p className="mt-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                {message}
              </p>
            )}
            <button
              disabled={verifying || code.length !== 6}
              className="mt-5 flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify and continue
            </button>
          </form>
          <button
            disabled={cooldown > 0}
            onClick={() => void sendVerification()}
            className="mt-3 flex h-10 w-full items-center justify-center rounded-md border border-border text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend code (${cooldown}s)` : "Send a new code"}
          </button>
          <button
            onClick={() => void signOut()}
            className="mt-4 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[oklch(0.105_0.022_255)] px-5 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(47,123,255,0.16),transparent_32%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px]" />
      <section className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-[oklch(0.14_0.025_255)] shadow-2xl md:grid-cols-[1.08fr_0.92fr]">
        <div className="flex flex-col justify-between border-b border-border p-7 md:border-b-0 md:border-r md:p-10">
          <div>
            <div className="flex items-center gap-3">
              <img
                src={jaytech}
                alt="JayCode"
                className="h-11 w-11 rounded-xl border border-primary/60 object-cover"
              />
              <div>
                <p className="text-lg font-semibold tracking-wide">
                  Jay<span className="text-primary">Code</span>
                </p>
                <p className="text-xs text-muted-foreground">Your browser IDE, now synced</p>
              </div>
            </div>
            <h1 className="mt-12 max-w-md text-3xl font-semibold leading-tight md:text-4xl">
              Sign in before the first line of code.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              Your project and every text file are saved to your private cloud workspace, so your
              code follows you between devices.
            </p>
          </div>
          <div className="mt-10 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 md:grid-cols-1">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-primary" /> Workspace access requires your
              account
            </div>
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-primary" /> Changes autosave to Netlify Database
            </div>
          </div>
        </div>

        <div className="p-7 md:p-10">
          <div className="flex rounded-lg border border-border bg-background/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-md px-3 py-2 ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md px-3 py-2 ${mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Create account
            </button>
          </div>

          <form className="mt-7 space-y-4" onSubmit={submit}>
            {mode === "signup" && (
              <label className="block text-xs font-medium text-muted-foreground">
                Name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
                  placeholder="Your name"
                />
              </label>
            )}
            <label className="block text-xs font-medium text-muted-foreground">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Password
              <input
                required
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
                placeholder="At least 6 characters"
              />
            </label>

            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                {message}
              </p>
            )}

            <button
              disabled={submitting}
              className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Open cloud workspace" : "Create cloud workspace"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
