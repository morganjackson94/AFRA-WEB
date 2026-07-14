import type { PrismaClient } from "../generated/prisma/client";

// B1 boundary — Meta Messaging (Instagram/Messenger). The conversation engine
// itself is NOT built here (held until the ManyChat API check picks the branch).
// This file defines the clean interface + a stub so the real provider drops in
// without refactoring. Two real branches will implement ChannelProvider:
//   P2 — orchestrate ManyChat's API (only if it supports per-tenant flow creation)
//   P3 — own engine on the Meta Messaging API (likely)
//
// Honesty rule preserved: the STUB connect() must NOT flip a connection to
// "connected". A stubbed channel stays stubbed, so evaluateReadiness() keeps the
// platform gate false and nothing reads as live. Only a REAL connect() flips it.

// "connecting" = the operator has clicked through to ManyChat's hosted connect
// page for their flow, but the founder hasn't confirmed it's actually live for
// them yet (see manychat.ts / the admin confirm route). Still honestly NOT
// "connected" — evaluateReadiness() only treats a literal "connected" as met.
export type ChannelStatus = "stubbed" | "connecting" | "connected" | "error";

export type SendResult = {
  delivered: boolean;
  providerMessageId?: string;
  /** true when produced by the stub (nothing was actually sent). */
  stub?: boolean;
};

export interface ChannelProvider {
  readonly mode: "stub" | "manychat" | "meta";

  /** Begin/complete the page connection (OAuth/token handshake). The real impl
   *  persists status "connected" + pageId; the stub deliberately does not. */
  connect(args: { channelConnectionId: string }): Promise<{ status: ChannelStatus; pageId?: string }>;

  /** Send one message to a candidate. `messageTag` carries the Meta message-tag
   *  needed outside the 24h window — modeled from line one so A5 nudge sending
   *  (which unstubs with B1) doesn't have to be retrofitted. */
  sendMessage(args: {
    channelConnectionId: string;
    recipient: string;
    text: string;
    messageTag?: string;
  }): Promise<SendResult>;

  /** Current connection status. */
  status(args: { channelConnectionId: string }): Promise<{ status: ChannelStatus }>;
}

// --- Stub (this session) -----------------------------------------------------

export class StubChannelProvider implements ChannelProvider {
  readonly mode = "stub" as const;
  constructor(private prisma: PrismaClient) {}

  async connect(args: { channelConnectionId: string }) {
    const conn = await this.prisma.channelConnection.findUniqueOrThrow({
      where: { id: args.channelConnectionId },
    });
    // Intentionally does NOT flip to "connected" — that would fake a live channel.
    console.log(`[channel:STUB] connect() is stubbed until B1/App Review — status stays "${conn.status}"`);
    return { status: conn.status as ChannelStatus, pageId: conn.pageId ?? undefined };
  }

  async sendMessage(args: { channelConnectionId: string; recipient: string; text: string; messageTag?: string }) {
    console.log(
      `[channel:STUB] would send to ${args.recipient}` +
        (args.messageTag ? ` (tag=${args.messageTag})` : "") +
        `: ${JSON.stringify(args.text)}`,
    );
    return { delivered: false, stub: true };
  }

  async status(args: { channelConnectionId: string }) {
    const conn = await this.prisma.channelConnection.findUniqueOrThrow({
      where: { id: args.channelConnectionId },
    });
    return { status: conn.status as ChannelStatus };
  }
}

// --- Real branches (NOT built — placeholders that make the seam explicit) -----

class UnbuiltChannelProvider implements ChannelProvider {
  constructor(readonly mode: "manychat" | "meta") {}
  private fail(): never {
    throw new Error(
      `Channel provider "${this.mode}" (B1) is not implemented yet — pending the ManyChat ` +
        `API capability check (Branch P2 vs P3) and Meta App Review.`,
    );
  }
  async connect() { return this.fail(); }
  async sendMessage() { return this.fail(); }
  async status() { return this.fail(); }
}

/** Returns the configured channel provider. Defaults to the stub; CHANNEL_PROVIDER
 *  can select a real branch once B1 is built (and will throw until then). */
export function getChannelProvider(prisma: PrismaClient): ChannelProvider {
  switch (process.env.CHANNEL_PROVIDER) {
    case "meta":
      return new UnbuiltChannelProvider("meta");
    case "manychat":
      return new UnbuiltChannelProvider("manychat");
    default:
      return new StubChannelProvider(prisma);
  }
}
