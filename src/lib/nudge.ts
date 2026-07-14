// A5 boundary — the "we chase them so you don't" nudge/reminder seam. The
// scheduling/cadence logic and real SENDING are not built this session (sending
// unstubs with B1, since it goes out over the channel). This defines the clean
// interface + a stub that logs intent, so A5 + real sending drop in later.

export type NudgeKind = "interview_reminder" | "no_show_followup";

export interface NudgeScheduler {
  readonly mode: "stub" | "live";

  /**
   * Schedule a nudge to a candidate. `withinMessagingWindow` and `messageTag`
   * encode the Meta 24h-window / message-tag constraint as a first-class input
   * from line one — so when sending unstubs with B1 it isn't retrofitted.
   * The stub only logs intent; nothing is sent.
   */
  scheduleNudge(args: {
    candidateId: string;
    conversationId?: string;
    kind: NudgeKind;
    sendAtISO: string;
    withinMessagingWindow?: boolean;
    messageTag?: string;
  }): Promise<{ scheduled: boolean; stub?: boolean }>;
}

export class StubNudgeScheduler implements NudgeScheduler {
  readonly mode = "stub" as const;

  async scheduleNudge(args: {
    candidateId: string;
    conversationId?: string;
    kind: NudgeKind;
    sendAtISO: string;
    withinMessagingWindow?: boolean;
    messageTag?: string;
  }) {
    console.log(
      `[nudge:STUB] would schedule ${args.kind} for candidate ${args.candidateId} at ${args.sendAtISO}` +
        ` (window=${args.withinMessagingWindow ?? "?"}${args.messageTag ? `, tag=${args.messageTag}` : ""}) — not sent`,
    );
    return { scheduled: true, stub: true };
  }
}

export function getNudgeScheduler(): NudgeScheduler {
  // Real sending unstubs with B1; until then, the stub logs intent.
  return new StubNudgeScheduler();
}
