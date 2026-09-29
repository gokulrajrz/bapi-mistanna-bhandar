import { useEffect, useRef } from "react";
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}
let loading: Promise<void> | undefined;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = undefined;
        reject(new Error("Unable to load the security check."));
      };
      document.head.append(script);
    });
  return loading;
}
export function Turnstile({
  siteKey,
  onToken,
  onError,
  resetKey = 0,
}: {
  siteKey: string;
  onToken: (v: string) => void;
  onError: (v: string) => void;
  resetKey?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };
  useEffect(() => {
    let id: string | undefined,
      cancelled = false;
    load()
      .then(() => {
        if (cancelled || !el.current) return;
        id = window.turnstile!.render(el.current, {
          sitekey: siteKey,
          action: "checkout",
          theme: "light",
          callback: (token: string) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(""),
          "error-callback": () => {
            callbacks.current.onToken("");
            callbacks.current.onError(
              "The security check could not load. Please retry.",
            );
          },
        });
      })
      .catch((e) => callbacks.current.onError(e.message));
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, resetKey]);
  return (
    <div
      ref={el}
      className="security-check"
      aria-label="Checkout security verification"
    />
  );
}
