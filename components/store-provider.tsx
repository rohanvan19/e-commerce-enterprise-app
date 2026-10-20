"use client";
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Toaster, toast } from "sonner";
import { api } from "@/lib/client";
import type { StoreState } from "@/lib/types";
type Context = {
  state: StoreState | null;
  error: string;
  refresh: () => Promise<void>;
  busy: boolean;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  setQuantity: (id: string, n: number) => Promise<void>;
  add: (id: string) => Promise<void>;
  save: (id: string) => Promise<void>;
  connected: boolean;
};
const StoreContext = createContext<Context | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cartOpen, setCartOpen] = useState(false),
    [connected, setConnected] = useState(false);
  const latest = useRef(state);
  const inflight = useRef<Promise<void> | null>(null);
  const writeLock = useRef(false);
  const stateReady = state !== null;
  const refresh = useCallback(() => {
    if (inflight.current) return inflight.current;
    inflight.current = api<StoreState>("state")
      .then((s) => {
        latest.current = s;
        setState(s);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, []);
  useEffect(() => {
    void refresh();
    const source = new EventSource("/api/events");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = () => {
      void refresh();
    };
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    const fallback = setInterval(
      focus,
      60000 + Math.floor(Math.random() * 10000),
    );
    return () => {
      source.close();
      clearInterval(fallback);
      window.removeEventListener("focus", focus);
    };
  }, [refresh, stateReady, state?.user?.id]);
  const setQuantity = useCallback(
    async (id: string, n: number) => {
      if (writeLock.current) return;
      writeLock.current = true;
      setBusy(true);
      try {
        await api("cart", { productId: id, quantity: n });
        await refresh();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        writeLock.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );
  const add = useCallback(
    async (id: string) => {
      const n = latest.current?.cart.find((p) => p.id === id)?.quantity || 0;
      await setQuantity(id, n + 1);
    },
    [setQuantity],
  );
  const save = useCallback(
    async (id: string) => {
      if (!latest.current?.user) {
        toast("Sign in to save your favourites.", {
          action: {
            label: "Sign in",
            onClick: () => location.assign("/account"),
          },
        });
        return;
      }
      try {
        await api("wishlist", {
          productId: id,
          saved: !latest.current.wishlist.includes(id),
        });
        await refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [refresh],
  );
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    };
    const model = (
      document as unknown as {
        modelContext?: {
          registerTool: (t: Tool, o: { signal: AbortSignal }) => unknown;
        };
      }
    ).modelContext;
    if (!model?.registerTool) return;
    const abort = new AbortController();
    try {
      void Promise.resolve(
        model.registerTool(
          {
            name: "search_chocolates",
            description:
              "Read the visible shop catalogue and current stock. Does not place an order.",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string" } },
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
            execute(input) {
              const q = (input as { query?: unknown })?.query;
              if (q !== undefined && typeof q !== "string")
                throw new Error("query must be text");
              return (latest.current?.products || [])
                .filter((p) =>
                  (p.name + " " + p.brand)
                    .toLowerCase()
                    .includes((q || "").toLowerCase()),
                )
                .map((p) => ({
                  id: p.id,
                  name: p.name,
                  pricePaise: p.price,
                  available: p.available_stock,
                }));
            },
          },
          { signal: abort.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => abort.abort();
  }, []);
  return (
    <StoreContext.Provider
      value={{
        state,
        error,
        refresh,
        busy,
        cartOpen,
        setCartOpen,
        setQuantity,
        add,
        save,
        connected,
      }}
    >
      {children}
      <Toaster richColors position="bottom-center" closeButton />
    </StoreContext.Provider>
  );
}
export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("Store provider is missing");
  return context;
}
