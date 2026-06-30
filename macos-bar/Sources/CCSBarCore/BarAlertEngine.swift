import Foundation

// MARK: Glance mode

/// Which figure leads the always-on menu-bar title. Persisted by raw value, so
/// the cases are a stable contract with `BarFormatting.statusTitle(...:mode:)`.
/// There is deliberately NO allTime/lifetime case — a lifetime dollar figure in
/// the bar reads as live spend and creates false urgency.
public enum BarGlanceMode: String, Sendable, Equatable, CaseIterable {
  case auto
  case todaySpend
  case monthSpend
  case lowestQuota
  case accountCount
}

// MARK: Alert kinds

/// The five alert conditions the engine evaluates. The raw values are STABLE:
/// they are embedded inside persisted fired-keys, so renaming a case orphans
/// any live key and would re-fire or silence alerts incorrectly.
public enum BarAlertKind: String, Sendable, Equatable, CaseIterable {
  case quotaRemainingBelow
  case dailySpendAbove
  case monthSpendAbove
  case reauthNeeded
  case accountCooldownOrPaused
}

// MARK: Preferences (pure value type)

/// User alert preferences. A pure input to the engine — the App hydrates this
/// from UserDefaults and passes it in; the engine never reads defaults itself.
public struct BarAlertPrefs: Sendable, Equatable {
  public var quotaEnabled: Bool
  public var quotaLevels: [Int]
  public var dailySpendEnabled: Bool
  public var dailyCapUSD: Double
  public var monthSpendEnabled: Bool
  public var monthCapUSD: Double
  public var reauthEnabled: Bool
  public var cooldownPausedEnabled: Bool
  public var glanceMode: BarGlanceMode

  public init(
    quotaEnabled: Bool = true,
    quotaLevels: [Int] = [20, 10, 0],
    dailySpendEnabled: Bool = true,
    dailyCapUSD: Double = 500,
    monthSpendEnabled: Bool = true,
    monthCapUSD: Double = 10000,
    reauthEnabled: Bool = true,
    cooldownPausedEnabled: Bool = true,
    glanceMode: BarGlanceMode = .auto
  ) {
    self.quotaEnabled = quotaEnabled
    self.quotaLevels = quotaLevels
    self.dailySpendEnabled = dailySpendEnabled
    self.dailyCapUSD = dailyCapUSD
    self.monthSpendEnabled = monthSpendEnabled
    self.monthCapUSD = monthCapUSD
    self.reauthEnabled = reauthEnabled
    self.cooldownPausedEnabled = cooldownPausedEnabled
    self.glanceMode = glanceMode
  }

  /// Quota levels defensively normalized: clamped to 0...100, de-duplicated, and
  /// sorted descending so the engine can pick the single most-severe crossed
  /// level deterministically regardless of how the prefs were entered.
  public var normalizedQuotaLevels: [Int] {
    Array(Set(quotaLevels.map { min(100, max(0, $0)) })).sorted(by: >)
  }
}

// MARK: Notification value + delivery protocol

/// A single notification the engine wants delivered this poll. `id` is the
/// fired-key (also used as the UN request identifier so the OS de-dupes at the
/// delivery layer too).
public struct BarNotification: Sendable, Equatable, Identifiable {
  public let id: String
  public let title: String
  public let body: String
  public let kind: BarAlertKind
  public init(id: String, title: String, body: String, kind: BarAlertKind) {
    self.id = id
    self.title = title
    self.body = body
    self.kind = kind
  }
}

/// Result of one evaluation. `firedKeys` is the COMPLETE next-state set — the
/// caller overwrites its stored set verbatim (no merge), which is what keeps the
/// persisted set bounded and lets cleared conditions re-arm.
public struct BarAlertEvaluation: Sendable, Equatable {
  public let toDeliver: [BarNotification]
  public let firedKeys: Set<String>
  public init(toDeliver: [BarNotification], firedKeys: Set<String>) {
    self.toDeliver = toDeliver
    self.firedKeys = firedKeys
  }
}

/// Real notification delivery. Declared in Core so the assert harness can supply
/// a recording implementation; the engine NEVER calls it — the App orchestrates
/// delivery from the engine's `toDeliver` output.
public protocol NotificationDelivering: Sendable {
  func deliver(_ notification: BarNotification)
}

// MARK: The pure rule engine

/// Namespace for the pure, deterministic alert rule engine. `evaluate` is
/// side-effect-free: no `Date()`, no IO, no UserDefaults. Everything time- or
/// state-dependent (`now`, `prefs`, `priorFiredKeys`, `calendar`) is injected.
public enum BarAlertEngine {
  /// Evaluate all rules against the current rows + analytics.
  ///
  /// Deterministic: accounts are iterated in stable id order so output order is
  /// reproducible. Returns the notifications to deliver and the complete next
  /// fired-key set (caller overwrites stored set verbatim).
  ///
  /// Key format: pipe-joined `kindRaw|scope|bucket[|suffix]`. Pipe (not colon)
  /// because `account.id` already contains a colon (`provider:accountId`).
  /// `scope` is the account id or literal "global". `bucket` is the re-arm token
  /// — when it rolls (new day/month/reset) the key changes and the alert re-fires.
  public static func evaluate(
    rows: [BarSummaryRow],
    analytics: BarAnalytics?,
    prefs: BarAlertPrefs,
    priorFiredKeys: Set<String>,
    now: Date,
    calendar: Calendar = .current
  ) -> BarAlertEvaluation {
    var fired = priorFiredKeys
    var out: [BarNotification] = []

    let sortedRows = rows.sorted { $0.id < $1.id }
    let dayBucket = localDayKey(now, calendar: calendar)
    let monthBucket = localMonthKey(now, calendar: calendar)
    let levels = prefs.normalizedQuotaLevels

    // Per-account rules.
    for row in sortedRows {
      let scope = row.id
      let name = row.displayName ?? row.provider

      // (1) quotaRemainingBelow — fire the SINGLE most-severe crossed level.
      // One alert per reset window (anti-spam): the fired-key embeds the reset
      // bucket (row.nextReset ?? "noreset" below), so once an account crosses a
      // level the alert is suppressed for the rest of that window even if quota
      // recovers and then drops again. It re-arms automatically when nextReset
      // rolls to a new window.
      if prefs.quotaEnabled, row.quotaStatus == "ok", let pct = row.quotaPercentage {
        let remaining = Int(pct.rounded())
        // levels sorted desc; the most-severe crossed level is the smallest L
        // with remaining <= L. One notif per account per poll, not one per level.
        if let level = levels.filter({ remaining <= $0 }).min() {
          let bucket = row.nextReset ?? "noreset"
          let key = "\(BarAlertKind.quotaRemainingBelow.rawValue)|\(scope)|\(bucket)|L\(level)"
          if !fired.contains(key) {
            let resets = BarQuotaGauge.resetCountdown(nextReset: row.nextReset, now: now)
            let resetSuffix = resets.map { " — \($0)" } ?? ""
            out.append(
              BarNotification(
                id: key,
                title: "Quota low",
                body: "\(name) quota at \(remaining)%\(resetSuffix)",
                kind: .quotaRemainingBelow))
            fired.insert(key)
          }
        }
      }

      // (4) reauthNeeded — clears-then-recurs.
      let reauthKey = "\(BarAlertKind.reauthNeeded.rawValue)|\(scope)|on"
      if prefs.reauthEnabled, row.needsReauth {
        if !fired.contains(reauthKey) {
          out.append(
            BarNotification(
              id: reauthKey,
              title: "Re-authentication needed",
              body: "\(name) needs re-authentication",
              kind: .reauthNeeded))
          fired.insert(reauthKey)
        }
      } else {
        // Condition cleared (or rule disabled): drop the key so it re-fires next
        // time the condition becomes true again.
        fired.remove(reauthKey)
      }

      // (5) accountCooldownOrPaused — clears-then-recurs on `paused`.
      let pausedKey = "\(BarAlertKind.accountCooldownOrPaused.rawValue)|\(scope)|on"
      if prefs.cooldownPausedEnabled, row.paused {
        if !fired.contains(pausedKey) {
          out.append(
            BarNotification(
              id: pausedKey,
              title: "Account paused",
              body: "\(name) is paused / cooling down",
              kind: .accountCooldownOrPaused))
          fired.insert(pausedKey)
        }
      } else {
        fired.remove(pausedKey)
      }
    }

    // Global rules.

    // (2) dailySpendAbove — strict >, per calendar day.
    if prefs.dailySpendEnabled {
      let today = analytics?.today.cost ?? 0
      if today > prefs.dailyCapUSD {
        let key = "\(BarAlertKind.dailySpendAbove.rawValue)|global|\(dayBucket)"
        if !fired.contains(key) {
          out.append(
            BarNotification(
              id: key,
              title: "Daily spend cap",
              body:
                "Daily spend \(BarFormatting.money(today)) is over your "
                + "\(BarFormatting.money(prefs.dailyCapUSD)) cap",
              kind: .dailySpendAbove))
          fired.insert(key)
        }
      }
    }

    // (3) monthSpendAbove — strict >, driven by calendar MTD (NOT last30d/allTime).
    if prefs.monthSpendEnabled {
      let mtd = analytics?.monthToDate.cost ?? 0
      if mtd > prefs.monthCapUSD {
        let key = "\(BarAlertKind.monthSpendAbove.rawValue)|global|\(monthBucket)"
        if !fired.contains(key) {
          out.append(
            BarNotification(
              id: key,
              title: "Monthly spend cap",
              body:
                "This month's spend \(BarFormatting.money(mtd)) is over your "
                + "\(BarFormatting.money(prefs.monthCapUSD)) cap",
              kind: .monthSpendAbove))
          fired.insert(key)
        }
      }
    }

    // PRUNE — keep the fired set bounded so it can't grow without limit across
    // day/month/reset rollovers or account churn.
    let presentIds = Set(rows.map { $0.id })
    let presentResetBuckets: [String: Set<String>] = rows.reduce(into: [:]) { buckets, row in
      buckets[row.id, default: []].insert(row.nextReset ?? "noreset")
    }
    fired = fired.filter { key in
      let parts = key.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
      guard let kind = parts.first else { return false }
      switch kind {
      case BarAlertKind.dailySpendAbove.rawValue:
        // parts: [kind, "global", dayBucket]
        return parts.count >= 3 && parts[2] == dayBucket
      case BarAlertKind.monthSpendAbove.rawValue:
        return parts.count >= 3 && parts[2] == monthBucket
      case BarAlertKind.quotaRemainingBelow.rawValue:
        // parts: [kind, accountId, bucket, "L<level>"]; bucket must equal the
        // account's CURRENT nextReset and the account must still be present.
        guard parts.count >= 3, presentIds.contains(parts[1]) else { return false }
        return presentResetBuckets[parts[1]]?.contains(parts[2]) == true
      case BarAlertKind.reauthNeeded.rawValue, BarAlertKind.accountCooldownOrPaused.rawValue:
        // parts: [kind, accountId, "on"]; keep only for still-present accounts.
        return parts.count >= 2 && presentIds.contains(parts[1])
      default:
        return false
      }
    }

    return BarAlertEvaluation(toDeliver: out, firedKeys: fired)
  }

  // MARK: Bucket helpers (local calendar, injected)

  /// Local calendar day key `yyyy-MM-dd` from injected `calendar`. Local (not
  /// UTC) to match the backend's local-day analytics semantics.
  static func localDayKey(_ date: Date, calendar: Calendar) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(
      format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  /// Local calendar month key `yyyy-MM`.
  static func localMonthKey(_ date: Date, calendar: Calendar) -> String {
    let c = calendar.dateComponents([.year, .month], from: date)
    return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
  }
}
