import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { getItem, getMe, logout, updateUpc, type Me, type PublicItem } from "./api";

type Alert = { title: string; content: string; type: "ok" | "warn" | "bad" };

const params = new URLSearchParams(window.location.search);
const oauthError = params.get("error");

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) {
    return (
      <Shell>
        <p className="text-center text-cream/70">Loading…</p>
      </Shell>
    );
  }

  if (!me) return <Login />;
  return <Scanner me={me} onLogout={() => setMe(null)} />;
}

function Login() {
  useEffect(() => {
    if (oauthError) {
      window.history.replaceState({}, "", "/");
    }
  }, []);
  return (
    <Shell>
      <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-panel p-8">
        <RocketMark className="mx-auto mb-6 h-16 w-16" />
        <h1 className="text-center text-2xl font-semibold">Manager Rocket 3000</h1>
        <p className="mt-2 text-center text-cream/70">
          Scan a Lightspeed SKU, write the UPC. Built for a phone and a Bluetooth scanner.
        </p>
        {oauthError ? (
          <Banner alert={{ title: "Sign-in failed", content: oauthError, type: "bad" }} />
        ) : null}
        <a
          href="/api/auth/login"
          className="mt-8 flex w-full items-center justify-center rounded-xl bg-cream px-4 py-4 text-lg font-semibold text-ink"
        >
          Sign in with Lightspeed
        </a>
      </div>
    </Shell>
  );
}

function Scanner({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [sku, setSku] = useState("");
  const [upc, setUpc] = useState("");
  const [item, setItem] = useState<PublicItem | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [busy, setBusy] = useState(false);
  const skuRef = useRef<HTMLInputElement>(null);
  const upcRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    skuRef.current?.focus();
  }, []);

  function reset(nextAlert?: Alert | null) {
    setSku("");
    setUpc("");
    setItem(null);
    setAlert(nextAlert ?? null);
    requestAnimationFrame(() => skuRef.current?.focus());
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!item) {
      if (!sku.trim()) {
        reset();
        return;
      }
      setBusy(true);
      try {
        const found = await getItem(sku.trim());
        setItem(found);
        setAlert(
          found.upc
            ? {
                title: "UPC already set",
                content: `Current UPC: ${found.upc}. Scan a new one to overwrite.`,
                type: "warn",
              }
            : null,
        );
        requestAnimationFrame(() => upcRef.current?.focus());
      } catch (err) {
        setAlert({
          title: "Lookup failed",
          content: err instanceof Error ? err.message : "Unknown error",
          type: "bad",
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      await updateUpc(item.itemID, upc);
      beep();
      reset({ title: "Updated", content: "UPC written to Lightspeed.", type: "ok" });
    } catch (err) {
      setUpc("");
      setAlert({
        title: "Update failed",
        content: err instanceof Error ? err.message : "Unknown error",
        type: "bad",
      });
      requestAnimationFrame(() => upcRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-cream/60">UPC Rocket</p>
          <p className="font-medium">
            {me.name}
            {me.shopName ? ` · ${me.shopName}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-line px-3 py-2 text-sm text-cream/80"
          onClick={async () => {
            await logout();
            onLogout();
          }}
        >
          Sign out
        </button>
      </header>

      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-xl rounded-2xl border border-line bg-panel p-6"
      >
        {alert ? <Banner alert={alert} /> : null}

        <label className="block text-sm font-medium text-cream/80">SKU</label>
        <input
          ref={skuRef}
          name="SKU"
          value={sku}
          autoComplete="off"
          enterKeyHint="go"
          disabled={Boolean(item) || busy}
          onChange={(e) => setSku(e.target.value)}
          className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-4 text-xl outline-none focus:border-cream disabled:opacity-60"
        />

        {item ? (
          <div className="mt-6">
            <p className="text-lg font-medium">{item.description}</p>
            <p className="mt-1 text-sm text-cream/60">
              {item.customSku ? `Custom ${item.customSku} · ` : ""}
              {item.manufacturerSku ? `Mfr ${item.manufacturerSku} · ` : ""}
              {item.systemSku}
            </p>
            <label className="mt-5 block text-sm font-medium text-cream/80">UPC</label>
            <input
              ref={upcRef}
              name="UPC"
              value={upc}
              autoComplete="off"
              inputMode="numeric"
              enterKeyHint="done"
              disabled={busy}
              onChange={(e) => setUpc(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-4 text-xl outline-none focus:border-cream"
            />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-cream px-4 py-4 text-lg font-semibold text-ink disabled:opacity-60"
        >
          {item ? "Update item" : "Search"}
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-3 w-full rounded-xl border border-cream/40 px-4 py-3 font-medium text-cream"
        >
          Reset
        </button>
      </form>
    </Shell>
  );
}

function Banner({ alert }: { alert: Alert }) {
  const color =
    alert.type === "ok" ? "text-ok" : alert.type === "warn" ? "text-warn" : "text-bad";
  const border =
    alert.type === "ok"
      ? "border-ok/40"
      : alert.type === "warn"
        ? "border-warn/40"
        : "border-bad/40";
  return (
    <div className={`mb-5 rounded-xl border ${border} bg-ink px-4 py-3`}>
      <p className={`font-semibold ${color}`}>{alert.title}</p>
      <p className="mt-1 text-sm text-cream/80">{alert.content}</p>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-8">{children}</div>
  );
}

function RocketMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#1e1a17" stroke="#3a322c" />
      <path
        d="M32 10c8 8 12 18 12 26 0 6-4 10-12 14-8-4-12-8-12-14 0-8 4-18 12-26z"
        fill="#f4d3a8"
      />
      <circle cx="32" cy="28" r="4" fill="#14110f" />
    </svg>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // ignore
  }
}
