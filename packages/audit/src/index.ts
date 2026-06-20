// @dct/audit — append-only, hash-chained audit log (Phase 4 / D7).
// Each event stores hash = sha256(prevHash || canonical(event)); the chain is
// tamper-evident (a verifier recomputes it). MemoryAuditLog is the default; a
// Postgres-backed append-only log is the production impl per docs/platform/02 & 06.
import { createHash } from "node:crypto";

export interface AuditEvent {
  seq: number;
  ts: string;
  actor: string;
  actorRoles: string[];
  action: string;
  subject: string;
  payload?: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

function canonical(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.map(canonical).join(",")}]`;
  const keys = Object.keys(o as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical((o as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export interface AppendInput {
  ts: string;
  actor: string;
  actorRoles: string[];
  action: string;
  subject: string;
  payload?: Record<string, unknown>;
}

export interface AuditLog {
  append(e: AppendInput): Promise<AuditEvent>;
  list(filter?: { actor?: string; subject?: string; action?: string }): Promise<AuditEvent[]>;
  verify(): Promise<{ ok: boolean; brokenAt?: number; length: number }>;
}

export class MemoryAuditLog implements AuditLog {
  private events: AuditEvent[] = [];

  private hashOf(prevHash: string, core: Omit<AuditEvent, "hash">): string {
    return createHash("sha256").update(prevHash + canonical(core)).digest("hex");
  }

  async append(input: AppendInput): Promise<AuditEvent> {
    const prevHash = this.events.length ? this.events[this.events.length - 1]!.hash : "GENESIS";
    const core: Omit<AuditEvent, "hash"> = {
      seq: this.events.length + 1,
      ts: input.ts,
      actor: input.actor,
      actorRoles: input.actorRoles,
      action: input.action,
      subject: input.subject,
      payload: input.payload,
      prevHash,
    };
    const event: AuditEvent = { ...core, hash: this.hashOf(prevHash, core) };
    this.events.push(event);
    return event;
  }

  async list(filter?: { actor?: string; subject?: string; action?: string }): Promise<AuditEvent[]> {
    return this.events.filter(
      (e) =>
        (!filter?.actor || e.actor === filter.actor) &&
        (!filter?.subject || e.subject === filter.subject) &&
        (!filter?.action || e.action === filter.action),
    );
  }

  async verify(): Promise<{ ok: boolean; brokenAt?: number; length: number }> {
    let prev = "GENESIS";
    for (const e of this.events) {
      const { hash, ...core } = e;
      if (core.prevHash !== prev || this.hashOf(prev, core) !== hash) {
        return { ok: false, brokenAt: e.seq, length: this.events.length };
      }
      prev = hash;
    }
    return { ok: true, length: this.events.length };
  }
}
