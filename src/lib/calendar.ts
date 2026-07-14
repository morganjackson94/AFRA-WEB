import type { PrismaClient } from "../generated/prisma/client";

// B2 boundary — Google Calendar. The real availability read + booking write land
// post-verification; the booking engine (A4) is also later. This file defines the
// clean interface + a stub so the real provider drops in without refactoring.
//
// Honesty rule preserved: the STUB connect() must NOT flip a calendar to
// "connected"; getAvailability() returns no real availability. The calendar gate
// therefore stays false until a REAL connect() happens.

export type CalendarStatus = "stubbed" | "connected" | "error";

/** An availability window, ISO-8601 strings (timezone comes from the Location). */
export type AvailabilitySlot = { startISO: string; endISO: string };

export interface CalendarProvider {
  readonly mode: "stub" | "google";

  /** Connect the location's calendar (OAuth). Real impl persists "connected" +
   *  calendarId; the stub does not. */
  connect(args: { calendarConnectionId: string }): Promise<{ status: CalendarStatus; calendarId?: string }>;

  /** Real availability read. Stub returns none (no faked open slots). */
  getAvailability(args: {
    locationId: string;
    fromISO: string;
    toISO: string;
  }): Promise<{ slots: AvailabilitySlot[]; stub?: boolean }>;

  /** Write a booking to the calendar. Stub logs intent and creates nothing. */
  book(args: {
    locationId: string;
    candidateId: string;
    slot: AvailabilitySlot;
  }): Promise<{ status: "booked" | "stubbed" | "error"; bookingRef?: string; stub?: boolean }>;

  status(args: { calendarConnectionId: string }): Promise<{ status: CalendarStatus }>;
}

// --- Stub (this session) -----------------------------------------------------

export class StubCalendarProvider implements CalendarProvider {
  readonly mode = "stub" as const;
  constructor(private prisma: PrismaClient) {}

  async connect(args: { calendarConnectionId: string }) {
    const conn = await this.prisma.calendarConnection.findUniqueOrThrow({
      where: { id: args.calendarConnectionId },
    });
    console.log(`[calendar:STUB] connect() is stubbed until B2/Google verify — status stays "${conn.status}"`);
    return { status: conn.status as CalendarStatus, calendarId: conn.calendarId ?? undefined };
  }

  async getAvailability(args: { locationId: string; fromISO: string; toISO: string }) {
    console.log(`[calendar:STUB] getAvailability(${args.locationId}, ${args.fromISO}..${args.toISO}) — no real availability`);
    return { slots: [], stub: true };
  }

  async book(args: { locationId: string; candidateId: string; slot: AvailabilitySlot }) {
    console.log(`[calendar:STUB] would book ${args.candidateId} @ ${args.slot.startISO} for location ${args.locationId}`);
    return { status: "stubbed" as const, stub: true };
  }

  async status(args: { calendarConnectionId: string }) {
    const conn = await this.prisma.calendarConnection.findUniqueOrThrow({
      where: { id: args.calendarConnectionId },
    });
    return { status: conn.status as CalendarStatus };
  }
}

// --- Real branch (NOT built — placeholder that makes the seam explicit) -------

class UnbuiltCalendarProvider implements CalendarProvider {
  readonly mode = "google" as const;
  private fail(): never {
    throw new Error("Google Calendar provider (B2) is not implemented yet — pending API verification.");
  }
  async connect() { return this.fail(); }
  async getAvailability() { return this.fail(); }
  async book() { return this.fail(); }
  async status() { return this.fail(); }
}

/** Returns the configured calendar provider. Defaults to the stub; CALENDAR_PROVIDER=google
 *  selects the real branch once B2 is built (and will throw until then). */
export function getCalendarProvider(prisma: PrismaClient): CalendarProvider {
  if (process.env.CALENDAR_PROVIDER === "google") return new UnbuiltCalendarProvider();
  return new StubCalendarProvider(prisma);
}
