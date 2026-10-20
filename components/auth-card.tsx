"use client";
import { useState } from "react";
import { ShieldCheck, Mail, Eye, EyeOff } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { api } from "@/lib/client";
import { useStore } from "./store-provider";
import { Field, TestInbox } from "./shared";
import { toast } from "sonner";
export function AuthCard({ admin = false }: { admin?: boolean }) {
  const { refresh } = useStore();
  const [mode, setMode] = useState<
      "login" | "register" | "verify" | "forgot" | "reset"
    >("login"),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const change = (m: typeof mode) => {
    setError("");
    setCode("");
    setMode(m);
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await api("auth/" + mode, { ...fields, email, code });
      if (mode === "register") {
        change("verify");
        toast.success("Account created. Verify your email to continue.");
      } else if (mode === "forgot") {
        change("reset");
        toast("If the email exists, a reset code is in the test inbox.");
      } else if (mode === "reset") {
        change("login");
        toast.success("Password reset. Sign in with your new password.");
      } else {
        await refresh();
        toast.success(
          mode === "verify"
            ? "Email verified. Welcome to the neighbourhood!"
            : "Welcome back.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    login: admin ? "Welcome to your workspace." : "Good to have you back.",
    register: "Join the sweet side.",
    verify: "Check your inbox.",
    forgot: "Let’s get you back in.",
    reset: "A fresh start.",
  };
  return (
    <section className="auth-card">
      <span className="eyebrow">
        <ShieldCheck size={16} />{" "}
        {admin
          ? "COCOA LOCAL · STORE OWNER"
          : "YOUR LITTLE CORNER OF COCOA LOCAL"}
      </span>
      <h2>{titles[mode]}</h2>
      <p className="muted">
        {mode === "login"
          ? "Sign in to keep your favourites close and your orders closer."
          : mode === "register"
            ? "A few details, then a little chocolate happiness."
            : mode === "verify"
              ? "Enter the six-digit code from your local test inbox."
              : mode === "forgot"
                ? "We’ll put a reset code in your local test inbox."
                : "Enter your reset code and choose a new password."}
      </p>
      {(mode === "login" || mode === "register") && !admin && (
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => change("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => change("register")}
          >
            Create account
          </button>
        </div>
      )}
      <form className="form-stack" onSubmit={submit}>
        {mode === "register" && (
          <div className="form-two">
            <Field label="Full name">
              <input
                name="name"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
              />
            </Field>
            <Field
              label="Mobile number"
              hint="Contact number; email is verified."
            >
              <input
                name="phone"
                type="tel"
                autoComplete="tel-national"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                required
              />
            </Field>
          </div>
        )}
        <Field label="Email address">
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
          />
        </Field>
        {["login", "register", "reset"].includes(mode) && (
          <Field
            label={mode === "reset" ? "New password" : "Password"}
            hint={
              mode === "login"
                ? undefined
                : "At least 12 characters. A memorable passphrase works well."
            }
          >
            <span className="password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </Field>
        )}
        {["verify", "reset"].includes(mode) && (
          <div className="field">
            <label htmlFor="verification-code">Six-digit code</label>
            <InputOTP
              id="verification-code"
              maxLength={6}
              value={code}
              onChange={setCode}
              pattern="^[0-9]+$"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot index={i} key={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <button
          className="button full"
          disabled={
            busy ||
            ((mode === "verify" || mode === "reset") && code.length !== 6)
          }
        >
          {busy
            ? "One moment…"
            : {
                login: "Sign in",
                register: "Create account",
                verify: "Verify email",
                forgot: "Send reset code",
                reset: "Save new password",
              }[mode]}
        </button>
      </form>
      <div className="auth-links">
        {mode === "login" ? (
          <>
            <button onClick={() => change("forgot")}>Forgot password?</button>
            <button onClick={() => change("verify")}>Verify email</button>
          </>
        ) : (
          <button onClick={() => change("login")}>Back to sign in</button>
        )}
        {mode === "verify" && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("auth/resend", { email });
                toast(
                  "If verification is needed, a new code is in your test inbox.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Send a new code
          </button>
        )}
      </div>
      <TestInbox email={email} />
      {admin && (
        <p className="muted text-small">
          Owner credentials are in the local access file delivered with this
          app.
        </p>
      )}
    </section>
  );
}
