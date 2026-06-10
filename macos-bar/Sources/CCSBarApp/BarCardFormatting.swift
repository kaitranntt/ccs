import Foundation
import CCSBarCore

/// App-side date phrasing for the subscription card. Kept out of Core so the
/// shared formatting contract there stays untouched. Parses ISO-8601 the same
/// way Core does (with and without fractional seconds) so timestamp handling
/// matches the rest of the bar.
enum BarCardFormatting {
  /// Parse an ISO-8601 timestamp, tolerating an optional fractional-seconds
  /// component. Mirrors Core's parser, which is module-internal there.
  private static func isoDate(_ iso: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFraction.date(from: iso) { return d }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: iso)
  }

  /// Compact reset form for the per-window bar chips and split lines:
  ///   <24h  → compact duration via BarQuotaGauge.compactDuration (e.g. "3h 15m", "22m")
  ///   <7d   → weekday abbreviation (e.g. "Fri")
  ///   >=7d  → calendar date (e.g. "Jun 14")
  /// Returns nil for a missing/unparseable timestamp (caller omits the clause).
  static func shortReset(iso: String?, now: Date) -> String? {
    guard let iso, let date = isoDate(iso) else { return nil }
    let secs = date.timeIntervalSince(now)
    if secs <= 0 { return "due" }
    if secs < 24 * 3600 {
      // Delegate to Core's authoritative compactDuration so both layers are
      // consistent and the days-tier is automatically handled if ever needed.
      let totalMinutes = Int(secs / 60)
      return BarQuotaGauge.compactDuration(minutes: totalMinutes)
    }
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    if secs < 7 * 24 * 3600 {
      fmt.dateFormat = "EEE"  // weekday, e.g. "Fri"
    } else {
      fmt.dateFormat = "MMM d"  // e.g. "Jun 14"
    }
    return fmt.string(from: date)
  }

  /// Local wall-clock "HH:mm" for the Codex stale footnote, e.g. "13:42".
  /// Returns nil for a missing/unparseable timestamp.
  static func clockTime(iso: String?) -> String? {
    guard let iso, let date = isoDate(iso) else { return nil }
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.dateFormat = "HH:mm"
    return fmt.string(from: date)
  }
}
