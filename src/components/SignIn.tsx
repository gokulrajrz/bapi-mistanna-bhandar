import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/request";
import { isDemo } from "../lib/api";
export function SignIn({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState(""),
    [token, setToken] = useState(""),
    [sent, setSent] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api(sent ? "/api/auth/verify" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(sent ? { email, token } : { email }),
      }),
    onSuccess: async () => {
      if (!sent) {
        setSent(true);
        return;
      }
      await client.invalidateQueries({ queryKey: ["session"] });
      await client.invalidateQueries({ queryKey: ["account"] });
      onSuccess?.();
    },
  });
  if (isDemo)
    return (
      <div className="notice">
        Sign-in is available when the store backend is connected. You can
        explore the catalogue and try demo checkout without an account.
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p>
        {sent
          ? "Enter the one-time code sent to your email."
          : "Sign in securely with a one-time email code."}
      </p>
      <label>
        Email address
        <input
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          disabled={sent}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {sent && (
        <label>
          Sign-in code
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,8}"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            maxLength={8}
          />
        </label>
      )}
      <button className="button" disabled={mutation.isPending}>
        {mutation.isPending
          ? "Please wait…"
          : sent
            ? "Verify and sign in"
            : "Send sign-in code"}
      </button>
      {sent && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setSent(false);
            setToken("");
            mutation.reset();
          }}
        >
          Use a different email or resend
        </button>
      )}
      {mutation.isError && (
        <p className="field-error" role="alert">
          {mutation.error.message}
        </p>
      )}
    </form>
  );
}
