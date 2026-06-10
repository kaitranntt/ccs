import Foundation

/// Pure formatting helpers for the status-bar title and dropdown rows.
/// No SwiftUI dependency so they are unit-testable on any toolchain.
public enum BarFormatting {
  /// Tri-state quota label. Honest about WHY a percentage is missing instead of
  /// collapsing every case to a bare "--":
  ///   status "ok"          + pct → "NN%"     (threshold-colored upstream)
  ///   status "unsupported"       → "no quota" (provider has no quota API)
  ///   status "error"             → "quota ?"  (transient fetch failure)
  /// An "ok" status with a nil percentage (shouldn't happen, but be safe) also
  /// degrades to "quota ?" rather than "--".
  public static func quotaLabel(percentage pct: Double?, status: String) -> String {
    switch status {
    case "ok":
      guard let pct else { return "quota ?" }
      return "\(Int(pct.rounded()))%"
    case "unsupported":
      return "no quota"
    default:
      return "quota ?"
    }
  }

  /// Quota title token: only an "ok" row with a real percentage yields a token
  /// (so "unsupported"/"error" rows can never produce "--" in the menu-bar
  /// title and the fallback chain falls through instead). Returns nil to skip.
  public static func quotaTitleToken(percentage pct: Double?, status: String) -> String? {
    guard status == "ok", let pct else { return nil }
    return "\(Int(pct.rounded()))%"
  }

  /// Today cost label, e.g. "$3.20" or "" when unknown/zero-not-shown.
  public static func costLabel(_ cost: Double?) -> String {
    guard let cost, cost > 0 else { return "" }
    return String(format: "$%.2f", cost)
  }

  /// Always-visible compact currency, e.g. "$0.00", "$12.34", "$2.6k", "$1.3M".
  /// Used for the analytics rollups where zero is meaningful (no spend yet).
  public static func money(_ v: Double) -> String {
    let n = max(0, v)
    if n >= 1_000_000 { return String(format: "$%.1fM", n / 1_000_000) }
    if n >= 1_000 { return String(format: "$%.1fk", n / 1_000) }
    return String(format: "$%.2f", n)
  }

  /// Compact integer count, e.g. "5", "1.2k", "3.4M".
  public static func count(_ n: Int) -> String {
    if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
    if n >= 1_000 { return String(format: "%.1fk", Double(n) / 1_000) }
    return "\(n)"
  }

  /// Compact, always-meaningful status-bar title. Evaluates an ordered fallback
  /// chain left to right; the first step that yields a non-empty token wins. A
  /// bare "--" is NEVER emitted — every step degrades to the next instead.
  ///
  ///   1. QUOTA      — lowest remaining quota among rows whose quotaStatus=="ok"
  ///                   with a real percentage → "<provider> NN%" (e.g. "agy 12%").
  ///                   "unsupported"/"error" rows are skipped so they can't show "--".
  ///   2. TODAY COST — else analytics.today.cost > 0 → "$<today>" (e.g. "$3.20").
  ///                   Uses the fresh aggregate from analytics, not per-row today_cost.
  ///   3. ATTENTION/COUNT — else rows needing reauth → "CCS <n>!"; else active
  ///                   (non-paused) count → "CCS <n>", fallback to total count.
  ///   4. "CCS"      — only when there are no rows at all.
  ///
  /// All-time spend is deliberately EXCLUDED from the title chain: a lifetime dollar
  /// figure (e.g. "$40.8k") always reads as live spend in the always-on menu bar,
  /// creating false urgency. It belongs only in the analytics section of the dropdown.
  public static func statusTitle(rows: [BarSummaryRow], analytics: BarAnalytics?) -> String {
    if rows.isEmpty { return "CCS" }

    // (1) QUOTA — closest to exhaustion among quota-capable rows.
    let quotaRows = rows.filter { $0.quotaStatus == "ok" && $0.quotaPercentage != nil }
    if let lead = quotaRows.min(by: { ($0.quotaPercentage ?? 0) < ($1.quotaPercentage ?? 0) }),
      let token = quotaTitleToken(percentage: lead.quotaPercentage, status: lead.quotaStatus)
    {
      return "\(lead.provider) \(token)"
    }

    // (2) TODAY COST — fresh aggregate from analytics (more accurate than summing
    // per-row today_cost, which may have nulls or stale snapshot values).
    if let todayCost = analytics?.today.cost, todayCost > 0 {
      return money(todayCost)
    }

    // (3) ATTENTION / ACTIVE COUNT.
    let reauthCount = rows.filter { $0.needsReauth }.count
    if reauthCount > 0 {
      return "CCS \(reauthCount)!"
    }
    let activeCount = rows.filter { !$0.paused }.count
    return "CCS \(activeCount > 0 ? activeCount : rows.count)"
  }

  /// Glance-mode title resolver. The user picks which figure leads the menu-bar
  /// title; every mode degrades to the `.auto` fallback chain rather than show a
  /// dead "$0.00" or a misleading lifetime dollar. A LIFETIME / allTime figure
  /// NEVER appears in any mode — that invariant is what keeps the always-on bar
  /// from reading like live spend.
  public static func statusTitle(
    rows: [BarSummaryRow], analytics: BarAnalytics?, mode: BarGlanceMode
  ) -> String {
    switch mode {
    case .auto:
      return statusTitle(rows: rows, analytics: analytics)

    case .todaySpend:
      // Avoid a dead "$0.00" sitting in the bar: only lead with today's spend
      // when there is some; otherwise fall through to the auto chain.
      if let c = analytics?.today.cost, c > 0 { return money(c) }
      return statusTitle(rows: rows, analytics: analytics)

    case .monthSpend:
      // Calendar month-to-date (the new backend field), NOT last30d/allTime.
      if let c = analytics?.monthToDate.cost, c > 0 { return money(c) }
      return statusTitle(rows: rows, analytics: analytics)

    case .lowestQuota:
      // Step (1) of the auto chain only: lowest remaining "ok" quota.
      let quotaRows = rows.filter { $0.quotaStatus == "ok" && $0.quotaPercentage != nil }
      if let lead = quotaRows.min(by: { ($0.quotaPercentage ?? 0) < ($1.quotaPercentage ?? 0) }),
        let token = quotaTitleToken(percentage: lead.quotaPercentage, status: lead.quotaStatus)
      {
        return "\(lead.provider) \(token)"
      }
      return statusTitle(rows: rows, analytics: analytics)

    case .accountCount:
      // Non-paused count, falling back to total when every account is paused.
      // Never appends "!" — that attention marker is an .auto-only signal.
      if rows.isEmpty { return statusTitle(rows: rows, analytics: analytics) }
      let active = rows.filter { !$0.paused }.count
      return "CCS \(active > 0 ? active : rows.count)"
    }
  }

  /// The "headline" account for the dropdown when no quota exists (which account
  /// name leads). Deterministic: prefer the default row, else the sole active
  /// row, else alphabetical by id — never `rows.first` (arbitrary order).
  public static func leadRow(_ rows: [BarSummaryRow]) -> BarSummaryRow? {
    if rows.isEmpty { return nil }
    if let def = rows.first(where: { $0.isDefault }) { return def }
    let active = rows.filter { !$0.paused }
    if active.count == 1 { return active[0] }
    return rows.min(by: { $0.id < $1.id })
  }

  /// Human "Last active" caption from an ISO timestamp + a precomputed day-delta.
  /// "Last active today" / "yesterday" / "Apr 29" — never a raw ISO string.
  public static func lastActiveLabel(iso: String?, daysSince: Int?) -> String? {
    guard let iso, let date = isoDate(iso) else { return nil }
    if let d = daysSince {
      if d <= 0 { return "Last active today" }
      if d == 1 { return "Last active yesterday" }
    }
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.dateFormat = "MMM d"
    return "Last active \(fmt.string(from: date))"
  }

  /// True when a row is a native first-party subscription (the user's own Claude
  /// Code or Codex plan) rather than a CLIProxy-managed OAuth pool account. Drives
  /// the "Subscriptions" grouping + badge so a user reads "this is MY plan quota",
  /// not one of the rotating pool credentials.
  public static func isNativeSubscription(provider: String) -> Bool {
    provider == "claude-code" || provider == "codex"
  }

  /// Friendly product label for a provider key. Native subscription keys read as
  /// products ("Claude Code", "Codex"); any other provider passes through verbatim
  /// (so "agy"/"ghcp"/"kiro" keep their established short chip text).
  public static func providerLabel(_ provider: String) -> String {
    switch provider {
    case "claude-code": return "Claude Code"
    case "codex": return "Codex"
    default: return provider
    }
  }

  /// Partition rows into (native subscriptions, CLIProxy pool accounts) while
  /// preserving the backend's order within each group. Used by the dropdown to
  /// render subscriptions above the pool. Pure so it is testable in Core.
  public static func partitionSubscriptions(
    _ rows: [BarSummaryRow]
  ) -> (subscriptions: [BarSummaryRow], pool: [BarSummaryRow]) {
    var subs: [BarSummaryRow] = []
    var pool: [BarSummaryRow] = []
    for row in rows {
      if isNativeSubscription(provider: row.provider) {
        subs.append(row)
      } else {
        pool.append(row)
      }
    }
    return (subs, pool)
  }

  /// Parse an ISO-8601 timestamp (with or without fractional seconds).
  static func isoDate(_ iso: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFraction.date(from: iso) { return d }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: iso)
  }
}

/// Force-refresh debounce. Arms the window at decision time so concurrent
/// open-triggered refreshes do not both bypass it (matches the server-side
/// 15s debounce on `/api/bar/summary?refresh=true`).
public struct RefreshDebouncer {
  public let interval: TimeInterval
  private var lastArmed: Date?

  public init(interval: TimeInterval = 15) {
    self.interval = interval
  }

  /// Returns true and arms the window if a force-refresh should proceed at
  /// `now`; returns false when still inside the previous window.
  public mutating func shouldRefresh(now: Date) -> Bool {
    if let lastArmed, now.timeIntervalSince(lastArmed) < interval {
      return false
    }
    lastArmed = now
    return true
  }
}
