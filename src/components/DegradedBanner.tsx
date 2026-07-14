import { PreviewTag } from "./PreviewTag";

// Degraded-connection notice. The reliability reassurance: when a channel or
// integration is unhealthy, the operator hears it CALMLY — never an alarming red
// error. Cream/rose, composed. The promise it makes: applicants are safe and will
// be handed to you, the system is not failing silently.
//
// Presentational for now. Wire `channel`/`detail` to real channel-health signals
// later (ChannelConnection.status === "error", calendar degraded, etc.).
export function DegradedBanner({
  channel = "Instagram",
  preview = false,
}: {
  channel?: string;
  preview?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-rose/40 bg-cream p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-rose" aria-hidden />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{channel} is reconnecting.</p>
            {preview && <PreviewTag />}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            New applicants are safe. We&apos;re holding each one and will hand them to you here until
            {" "}
            {channel} is back. Nothing is lost and nobody gets spammed.
          </p>
        </div>
      </div>
    </div>
  );
}
