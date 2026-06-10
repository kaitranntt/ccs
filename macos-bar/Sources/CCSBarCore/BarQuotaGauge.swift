import Foundation

/// Pure quota-gauge math: band selection, fill fraction, and reset-countdown
/// formatting. No SwiftUI dependency and no implicit clock — `now` is injected
/// for `resetCountdown` so the gauge is fully deterministic and testable. The
/// App layer renders a ring/bar from these values; all branch/color/countdown
/// logic lives here so the view stays a thin render.
public enum BarQuotaGauge {
  /// Severity band for the remaining-quota percentage. `.none` means the row
  /// has no live quota (unsupported provider, fetch error, or a nil percentage)
  /// and the gauge should not be drawn at all.
  public enum Band: String, Sendable, Equatable, CaseIterable {
    case green
    case yellow
    case orange
    case red
    case none
  }

  /// Map a remaining-quota percentage to a severity band. Only a status of "ok"
  /// with a real percentage yields a colored band; everything else is `.none`.
  /// Boundaries (remaining): >50 green, 21...50 yellow, 11...20 orange, <=10 red.
  public static func band(percentage pct: Double?, status: String) -> Band {
    guard status == "ok", let pct else { return .none }
    if pct > 50 { return .green }
    if pct > 20 { return .yellow }
    if pct > 10 { return .orange }
    return .red
  }

  /// Fraction of the ring/bar to fill: remaining/100 clamped to 0...1. Returns
  /// nil when there is no live quota (so the view can fall back to a text label
  /// instead of drawing an empty gauge).
  public static func fillFraction(percentage pct: Double?, status: String) -> Double? {
    guard status == "ok", let pct else { return nil }
    return min(1, max(0, pct / 100))
  }

  /// Human countdown to the next quota reset, e.g. "resets in 1d 21h",
  /// "resets in 3h 12m", "resets in 12m", or "resets soon" when the reset
  /// time is at/in the past. Returns nil for nil/unparseable timestamps.
  /// `now` is injected so the formatting is deterministic and unit-testable.
  public static func resetCountdown(nextReset: String?, now: Date) -> String? {
    guard let nextReset, let reset = BarFormatting.isoDate(nextReset) else { return nil }
    let secs = reset.timeIntervalSince(now)
    if secs <= 0 { return "resets soon" }
    let totalMinutes = Int(secs / 60)
    // Three-tier: days (>=24h) → hours+minutes (1h-24h) → minutes-only (<1h).
    return "resets in \(compactDuration(minutes: totalMinutes))"
  }

  // MARK: Burn-rate projection (single-window, no history)

  /// Project minutes-to-exhaustion for ONE quota window from a single snapshot.
  ///
  /// Linear model, no smoothing, no cross-window inference: a window of length
  /// `windowMinutes` that resets at `resetAt` started at `resetAt - windowMinutes`
  /// and has been running `elapsed = windowMinutes - max(0, (resetAt - now)/60)`
  /// minutes. The window's OWN average burn rate is `usedPercent / elapsed`
  /// (%/min); minutes left to hit 100% is `(100 - usedPercent) / rate`, which
  /// simplifies to `(100 - usedPercent) * elapsed / usedPercent`.
  ///
  /// Returns:
  ///   - nil when any input is unknown (windowMinutes/resetAt nil, elapsed <= 0):
  ///     the caller OMITS the pace clause rather than guessing.
  ///   - nil when usage is near-zero (<= ~1%): burn is negligible, the caller
  ///     renders "plenty at this pace" instead of an absurdly large projection.
  ///   - 0 when already exhausted (usedPercent >= 100): "limit reached".
  ///   - otherwise the projected whole minutes remaining at the current pace.
  public static func burnMinutesRemaining(
    usedPercent: Double, resetAt: Date?, windowMinutes: Int?, now: Date
  ) -> Int? {
    guard let windowMinutes, let resetAt else { return nil }
    let minutesToReset = resetAt.timeIntervalSince(now) / 60
    let elapsed = Double(windowMinutes) - max(0, minutesToReset)
    guard elapsed > 0 else { return nil }
    if usedPercent >= 100 { return 0 }
    // Near-zero burn would project an effectively infinite runway; treat it as
    // "plenty" (nil) so the phrasing layer can say so honestly.
    guard usedPercent > 1.0 else { return nil }
    let remaining = (100 - usedPercent) * elapsed / usedPercent
    return Int(remaining)
  }

  /// Pick the BINDING window: the one a subscription runs out of first, i.e. the
  /// lowest `remainingPercent` (closest to empty). Ties break to the shorter
  /// window first (5h before week), then by a stable key order so the choice is
  /// deterministic. Opus/Sonnet windows are eligible. Returns nil for empty
  /// input (error/reauth rows have no windows, so they get no hero gauge).
  public static func selectBindingWindow(_ windows: [QuotaWindowDetail]) -> QuotaWindowDetail? {
    guard !windows.isEmpty else { return nil }
    return windows.min { a, b in
      if a.remainingPercent != b.remainingPercent {
        return a.remainingPercent < b.remainingPercent
      }
      let am = a.windowMinutes ?? Int.max
      let bm = b.windowMinutes ?? Int.max
      if am != bm { return am < bm }
      return keyRank(a.key) < keyRank(b.key)
    }
  }

  /// Stable ordering for window keys when remaining% and length tie.
  private static func keyRank(_ key: String) -> Int {
    switch key {
    case "five_hour": return 0
    case "seven_day": return 1
    case "seven_day_opus": return 2
    case "seven_day_sonnet": return 3
    default: return 4
    }
  }

  /// Whether a window is GENUINELY at risk of exhaustion before it resets.
  ///
  /// Returns true only when the projected exhaustion time (burn rate × remaining
  /// headroom) is LESS than the time remaining until the next reset — i.e. the
  /// user will hit the wall before the window refreshes. When the projection is
  /// larger than the reset countdown the warning is meaningless (the quota will
  /// reset before running out), so atRisk returns false and no scary number is
  /// shown. Inputs mirror `paceClause`; `now` is injected for testability.
  public static func atRisk(
    usedPercent: Double,
    remainingPercent: Double,
    resetAt: String?,
    windowMinutes: Int?,
    status: String = "ok",
    now: Date
  ) -> Bool {
    guard status != "rejected", remainingPercent > 0 else { return false }
    guard let resetDateStr = resetAt,
          let resetDate = BarFormatting.isoDate(resetDateStr)
    else { return false }
    let minutesToReset = resetDate.timeIntervalSince(now) / 60
    guard minutesToReset > 0 else { return false }
    guard let burn = burnMinutesRemaining(
      usedPercent: usedPercent, resetAt: resetDate, windowMinutes: windowMinutes, now: now)
    else { return false }
    // burn == 0 means already exhausted — that is handled by the exhausted path, not atRisk.
    guard burn > 0 else { return false }
    // Only at-risk when we will exhaust BEFORE the window resets.
    return Double(burn) < minutesToReset
  }

  /// Trailing pace clause for a window's hero/footer line, or nil to OMIT it.
  ///
  /// Phrasing rules (in order):
  ///   - exhausted (remaining <= 0) or status "rejected" → "limit reached,
  ///     resets in <countdown>". This REPLACES the bare reset countdown.
  ///   - lots of headroom (remaining >= 85) or near-zero usage (burn == nil) →
  ///     "plenty at this pace".
  ///   - at-risk (projected exhaustion BEFORE reset): a finite projection m >= 5
  ///     → "~<Hh Mm> left at this pace". m < 5 → limit-reached path.
  ///   - NOT at-risk (burn > minutesToReset): the projection is beyond the reset,
  ///     so showing the number is misleading — return nil (omit entirely).
  ///   - unknown window (windowMinutes/resetAt nil, elapsed <= 0) → nil (omit).
  ///   - resetAt already in the past (clock skew / stale) → nil pace.
  public static func paceClause(
    usedPercent: Double,
    remainingPercent: Double,
    resetAt: String?,
    windowMinutes: Int?,
    status: String = "ok",
    now: Date
  ) -> String? {
    let resetDate = resetAt.flatMap { BarFormatting.isoDate($0) }

    if remainingPercent <= 0 || status == "rejected" {
      if let countdown = resetCountdown(nextReset: resetAt, now: now) {
        // resetCountdown returns "resets in 3h 12m"; reuse just the duration.
        let duration = countdown.replacingOccurrences(of: "resets in ", with: "")
        return "limit reached, resets in \(duration)"
      }
      return "limit reached"
    }

    // A reset in the past means our window math is unreliable; omit the pace.
    if let resetDate, resetDate.timeIntervalSince(now) <= 0 { return nil }

    let burn = burnMinutesRemaining(
      usedPercent: usedPercent, resetAt: resetDate, windowMinutes: windowMinutes, now: now)

    if remainingPercent >= 85 || burn == nil {
      // nil burn here is either unknown window (handled below) or near-zero use.
      if windowMinutes == nil || resetDate == nil { return nil }
      return "plenty at this pace"
    }

    guard let m = burn else { return nil }
    if m < 5 {
      // Floor: anything under 5 minutes is effectively spent; say so plainly.
      if let countdown = resetCountdown(nextReset: resetAt, now: now) {
        let duration = countdown.replacingOccurrences(of: "resets in ", with: "")
        return "limit reached, resets in \(duration)"
      }
      return "limit reached"
    }

    // Core at-risk gate: only show the projection when exhaustion is BEFORE the
    // reset. If burn >= minutesToReset the quota will outlast the window and the
    // number would be larger than the reset countdown — meaningless and confusing.
    let minutesToReset = resetDate.map { $0.timeIntervalSince(now) / 60 } ?? 0
    guard Double(m) < minutesToReset else { return nil }

    return "~\(compactDuration(minutes: m)) left at this pace"
  }

  /// Compact terse duration with a three-tier scale:
  ///   >= 24h  → "Nd Nh"  (e.g. 1590m → "1d 2h", 2678m → "1d 21h")
  ///   1h–24h  → "Hh Mm"  (e.g. 195m  → "3h 15m")
  ///   < 1h    → "Mm"     (e.g. 35m   → "35m")
  ///
  /// Named `compactDuration` and `public` so it is reusable from App-side
  /// formatting (BarCardFormatting) without duplicating the logic.
  public static func compactDuration(minutes: Int) -> String {
    let totalHours = minutes / 60
    let m = minutes % 60
    if totalHours >= 24 {
      let d = totalHours / 24
      let h = totalHours % 24
      return "\(d)d \(h)h"
    }
    if totalHours > 0 { return "\(totalHours)h \(m)m" }
    return "\(m)m"
  }

  /// Header "most room" leader: among subscription rows that have a binding
  /// window, the one whose BINDING window has the HIGHEST remaining%. Rows with
  /// no binding window (error/reauth) are excluded. Tie-breaks alphabetically by
  /// display name (falling back to provider). Returns nil with fewer than two
  /// eligible subscriptions (the header is suppressed below that).
  public static func headroomLeader(_ rows: [BarSummaryRow]) -> (label: String, remainingPercent: Double)? {
    let eligible: [(label: String, remaining: Double)] = rows.compactMap { row in
      guard let binding = selectBindingWindow(row.quotaWindows ?? []) else { return nil }
      let label = row.displayName ?? row.provider
      return (label, binding.remainingPercent)
    }
    guard eligible.count >= 2 else { return nil }
    let leader = eligible.max { a, b in
      if a.remaining != b.remaining { return a.remaining < b.remaining }
      // Highest remaining wins; alphabetical tie-break (smaller name "wins" max
      // only when remaining is equal, so invert the name comparison).
      return a.label > b.label
    }
    guard let leader else { return nil }
    return (leader.label, leader.remaining)
  }
}
