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

  // MARK: - Axis label formatters (used by BarAnalyticsView spend chart)

  /// Short hour label from a byHour key "YYYY-MM-DD HH:00", e.g. "12a", "6p".
  /// Extracts the HH part (characters at index 11-12) and converts to 12-hour
  /// format with lowercase "a"/"p" suffix. Returns nil for unparseable keys.
  static func hourShort(fromHourKey key: String) -> String? {
    // key format: "YYYY-MM-DD HH:00" — HH is at offset 11, length 2.
    guard key.count >= 13 else { return nil }
    let start = key.index(key.startIndex, offsetBy: 11)
    let end = key.index(start, offsetBy: 2)
    guard let hour = Int(key[start..<end]) else { return nil }
    switch hour {
    case 0: return "12a"
    case 1..<12: return "\(hour)a"
    case 12: return "12p"
    default: return "\(hour - 12)p"
    }
  }

  /// Short weekday label from a byDay key "YYYY-MM-DD", e.g. "Mon".
  /// Returns nil for unparseable keys. Formats in UTC to match how `dayDate`
  /// parses the key, so the weekday names the calendar day the key represents
  /// (formatting in local time would shift it a day for users west of UTC).
  static func weekdayShort(fromDayKey key: String) -> String? {
    guard let date = dayDate(fromKey: key) else { return nil }
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.timeZone = TimeZone(identifier: "UTC")
    fmt.dateFormat = "EEE"
    return fmt.string(from: date)
  }

  /// Short month+day label from a byDay key "YYYY-MM-DD", e.g. "Jun 5".
  /// Returns nil for unparseable keys. Formats in UTC to match `dayDate`'s
  /// parse zone so the label names the same calendar day as the key.
  static func monthDayShort(fromDayKey key: String) -> String? {
    guard let date = dayDate(fromKey: key) else { return nil }
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.timeZone = TimeZone(identifier: "UTC")
    fmt.dateFormat = "MMM d"
    return fmt.string(from: date)
  }

  /// Parse a "YYYY-MM-DD" key into a Date at midnight UTC.
  private static func dayDate(fromKey key: String) -> Date? {
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.timeZone = TimeZone(identifier: "UTC")
    fmt.dateFormat = "yyyy-MM-dd"
    return fmt.date(from: key)
  }
}
