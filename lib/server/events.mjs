import pg from "pg";
import { currentUser, parseCookies, digest } from "./auth.mjs";
import { connectionOptions } from "./db.mjs";
const key = Symbol.for("cocoa-local.postgres.events.v1");
const hub = (globalThis[key] ||= {
  listeners: new Set(),
  client: null,
  connecting: null,
  timer: null,
});
const channel = "cocoa_changes_" + (process.env.DATABASE_SCHEMA || "public");
const broadcast = (audience = "all") => {
  for (const notify of hub.listeners) notify(audience);
};
async function connect() {
  if (hub.client || !hub.listeners.size) return;
  if (hub.connecting) return hub.connecting;
  hub.connecting = (async () => {
    const opts = connectionOptions(
      process.env.DATABASE_LISTEN_URL || process.env.DATABASE_URL,
    );
    const client = new pg.Client({
      ...opts,
      application_name: "cocoa-local-notifications",
    });
    let failed = false;
    const recover = () => {
      if (failed) return;
      failed = true;
      if (hub.client === client) hub.client = null;
      void client.end().catch(() => {});
      if (hub.listeners.size && !hub.timer)
        hub.timer = setTimeout(() => {
          hub.timer = null;
          void connect().catch(() => {});
        }, 2000);
    };
    client.on("error", recover);
    client.on("end", recover);
    client.on("notification", (message) => {
      if (message.channel === channel) {
        try {
          broadcast(JSON.parse(message.payload).audience);
        } catch {}
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${channel}`);
      if (!hub.listeners.size) {
        await client.end();
        return;
      }
      hub.client = client;
      broadcast(); // Refresh after reconnection to cover missed notifications.
    } catch (error) {
      recover();
      throw error;
    }
  })().finally(() => {
    hub.connecting = null;
  });
  return hub.connecting;
}
export async function eventStream(request) {
  const user = await currentUser(request);
  const guest = parseCookies(request).cocoa_cart;
  const audience = user
    ? "user:" + user.id
    : guest
      ? "cart:" + digest(guest)
      : "anonymous";
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false,
        pending;
      const send = (target = "all") => {
        if (closed || pending || (target !== "all" && target !== audience))
          return;
        // Coalesce bursts; one checkout may change several records.
        pending = setTimeout(() => {
          pending = null;
          if (!closed)
            controller.enqueue(encoder.encode('data: {"changed":true}\n\n'));
        }, 200);
      };
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 25000);
      stop = () => {
        if (closed) return;
        closed = true;
        clearTimeout(pending);
        clearInterval(heartbeat);
        hub.listeners.delete(send);
        request.signal.removeEventListener("abort", stop);
        if (!hub.listeners.size) {
          clearTimeout(hub.timer);
          hub.timer = null;
          const client = hub.client;
          hub.client = null;
          void client?.end().catch(() => {});
        }
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", stop, { once: true });
      hub.listeners.add(send);
      void connect().catch(() => {});
      if (request.signal.aborted) stop();
      else send();
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
