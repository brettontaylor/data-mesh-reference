// @dct/events — domain events + webhook delivery (Phase 7).
// In-memory event log + HMAC-signed, retried webhook delivery with a dead-letter
// queue and replay. Production swaps the in-memory log for a transactional outbox
// (Postgres) + a dispatcher (the same interface), and can fan out to Kafka.
import { createHmac, randomUUID } from "node:crypto";

export interface DomainEvent {
  id: string;
  type: string; // e.g. change.proposed, change.merged, model.registered, pipeline.run.completed
  ts: string;
  subject: string;
  actor?: string;
  payload: Record<string, unknown>;
}

export interface WebhookSub {
  id: string;
  url: string;
  secret: string;
  events: string[]; // event types or ['*']
}

export interface DeadLetter {
  id: string;
  subId: string;
  url: string;
  event: DomainEvent;
  attempts: number;
  lastError: string;
}

export interface EventBusOptions {
  maxAttempts?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => string;
}

export function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export class EventBus {
  private events: DomainEvent[] = [];
  private subs: WebhookSub[] = [];
  private dlq: DeadLetter[] = [];
  private maxAttempts: number;
  private backoffMs: number;
  private f: typeof fetch;
  private now: () => string;

  constructor(opts: EventBusOptions = {}) {
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.backoffMs = opts.backoffMs ?? 50;
    this.f = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  subscribe(sub: Omit<WebhookSub, "id">): WebhookSub {
    const full = { ...sub, id: randomUUID() };
    this.subs.push(full);
    return full;
  }
  subscriptions() {
    return this.subs.map((s) => ({ ...s, secret: "***" }));
  }
  list(since?: string): DomainEvent[] {
    return since ? this.events.filter((e) => e.ts > since) : this.events;
  }
  deadLetters() {
    return this.dlq;
  }

  /** Emit an event: persist, then deliver to matching webhooks (awaited). */
  async emit(input: Omit<DomainEvent, "id" | "ts">): Promise<DomainEvent> {
    const event: DomainEvent = { ...input, id: randomUUID(), ts: this.now() };
    this.events.push(event);
    const targets = this.subs.filter((s) => s.events.includes("*") || s.events.includes(event.type));
    await Promise.all(targets.map((s) => this.deliver(s, event)));
    return event;
  }

  private async deliver(sub: WebhookSub, event: DomainEvent): Promise<void> {
    const body = JSON.stringify(event);
    const signature = sign(sub.secret, body);
    let lastError = "";
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await this.f(sub.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-dct-event": event.type,
            "x-dct-signature": signature,
          },
          body,
        });
        if (res.ok) return;
        lastError = `HTTP ${res.status}`;
      } catch (e) {
        lastError = String(e);
      }
      if (attempt < this.maxAttempts) await new Promise((r) => setTimeout(r, this.backoffMs * attempt));
    }
    this.dlq.push({ id: randomUUID(), subId: sub.id, url: sub.url, event, attempts: this.maxAttempts, lastError });
  }

  /** Replay a dead-lettered delivery. Removes it from the DLQ on success. */
  async replay(dlqId: string): Promise<{ ok: boolean; error?: string }> {
    const idx = this.dlq.findIndex((d) => d.id === dlqId);
    if (idx < 0) return { ok: false, error: "not found" };
    const dl = this.dlq[idx]!;
    const sub = this.subs.find((s) => s.id === dl.subId);
    if (!sub) return { ok: false, error: "subscription gone" };
    const before = this.dlq.length;
    await this.deliver(sub, dl.event);
    if (this.dlq.length > before) {
      this.dlq.splice(before); // drop the duplicate DLQ entry the retry just added
      return { ok: false, error: this.dlq[idx]?.lastError ?? "delivery failed" };
    }
    this.dlq.splice(idx, 1);
    return { ok: true };
  }
}
