import Foundation

/// One quota window for a native subscription row (Claude/Codex).
///
/// Carries BOTH `usedPercent` and `remainingPercent` verbatim from the backend
/// so the bar never re-derives one from the other (a single source of truth
/// avoids rounding drift between the collapsed glance value and the per-window
/// pace math). `windowMinutes` is the window length (300 = 5h, 10080 = 7d) used
/// by the burn-rate projection; nil when the backend could not determine it.
///
/// JSON: the parent field serializes to "quota_windows" (snake_case), but the
/// inner keys stay camelCase to match the live serializer.
public struct QuotaWindowDetail: Codable, Sendable, Equatable, Identifiable {
  public let key: String
  public let label: String
  public let usedPercent: Double
  public let remainingPercent: Double
  public let resetAt: String?
  public let windowMinutes: Int?

  /// SwiftUI list identity: the window key is unique within a row.
  public var id: String { key }

  public init(
    key: String,
    label: String,
    usedPercent: Double,
    remainingPercent: Double,
    resetAt: String? = nil,
    windowMinutes: Int? = nil
  ) {
    self.key = key
    self.label = label
    self.usedPercent = usedPercent
    self.remainingPercent = remainingPercent
    self.resetAt = resetAt
    self.windowMinutes = windowMinutes
  }
}

/// One account row in the menu-bar glance.
///
/// Mirrors the `GET /api/bar/summary` payload exactly (mixed snake_case and
/// camelCase keys, matching the CCS web-server response).
public struct BarSummaryRow: Codable, Sendable, Identifiable, Equatable {
  public let accountId: String
  public let provider: String
  public let displayName: String?
  public let tier: String?
  public let paused: Bool
  public let quotaPercentage: Double?
  /// Tri-state quota availability: "ok" (provider has a quota API and the fetch
  /// succeeded), "unsupported" (provider has no quota API at all, e.g. ghcp/kiro),
  /// or "error" (should report quota but the fetch failed/timed out/needs reauth).
  /// Drives "no quota" (unsupported) vs "quota ?" (error) so a bare "--" never
  /// conflates the two.
  public let quotaStatus: String
  public let nextReset: String?
  /// True when this is the provider's default account; drives the active/default badge.
  public let isDefault: Bool
  /// ISO timestamp this account was last used, null if never/unknown.
  public let lastActivityAt: String?
  public let todayCost: Double?
  public let health: String
  public let cached: Bool
  public let fetchedAt: String?
  public let needsReauth: Bool
  /// Multi-profile: which CCS surface owns this profile ("ccs" = Claude via
  /// `ccs auth`, "ccsx" = Codex via `ccsx auth`). nil on CLIProxy pool rows.
  public let surface: String?
  /// Multi-profile: the profile name (e.g. "work", "ck", "personal"). nil on
  /// CLIProxy pool rows.
  public let profile: String?
  /// Explicit native-subscription flag. true on all native rows (Claude/Codex
  /// own subscription), nil/false on CLIProxy pool rows. Replaces the brittle
  /// `accountId == "claude-code"` heuristic.
  public let isSubscription: Bool?
  /// Native-only per-window quota breakdown (Claude: 5h/week/opus/sonnet,
  /// Codex: 5h/week). nil for CLIProxy pool rows, which omit "quota_windows"
  /// entirely — so legacy payloads decode unchanged (backward compatible).
  public let quotaWindows: [QuotaWindowDetail]?
  /// Native-only ISO mtime of the source session that supplied a STALE Codex
  /// reading. Present only when the data is stale; nil otherwise. Drives the
  /// "as of HH:mm (older session)" footnote without faking a "live" badge.
  public let staleAsOf: String?

  /// Stable identity for SwiftUI lists: provider-scoped account id.
  public var id: String { "\(provider):\(accountId)" }

  enum CodingKeys: String, CodingKey {
    case accountId = "account_id"
    case provider
    case displayName
    case tier
    case paused
    case quotaPercentage = "quota_percentage"
    case quotaStatus
    case nextReset = "next_reset"
    case isDefault = "is_default"
    case lastActivityAt = "last_activity_at"
    case todayCost = "today_cost"
    case health
    case cached
    case fetchedAt
    case needsReauth
    case surface
    case profile
    case isSubscription = "is_subscription"
    case quotaWindows = "quota_windows"
    case staleAsOf = "stale_as_of"
  }

  public init(
    accountId: String,
    provider: String,
    displayName: String? = nil,
    tier: String? = nil,
    paused: Bool = false,
    quotaPercentage: Double? = nil,
    quotaStatus: String = "ok",
    nextReset: String? = nil,
    isDefault: Bool = false,
    lastActivityAt: String? = nil,
    todayCost: Double? = nil,
    health: String = "ok",
    cached: Bool = false,
    fetchedAt: String? = nil,
    needsReauth: Bool = false,
    surface: String? = nil,
    profile: String? = nil,
    isSubscription: Bool? = nil,
    quotaWindows: [QuotaWindowDetail]? = nil,
    staleAsOf: String? = nil
  ) {
    self.accountId = accountId
    self.provider = provider
    self.displayName = displayName
    self.tier = tier
    self.paused = paused
    self.quotaPercentage = quotaPercentage
    self.quotaStatus = quotaStatus
    self.nextReset = nextReset
    self.isDefault = isDefault
    self.lastActivityAt = lastActivityAt
    self.todayCost = todayCost
    self.health = health
    self.cached = cached
    self.fetchedAt = fetchedAt
    self.needsReauth = needsReauth
    self.surface = surface
    self.profile = profile
    self.isSubscription = isSubscription
    self.quotaWindows = quotaWindows
    self.staleAsOf = staleAsOf
  }

  /// Resilient decode: the two native-only keys are decoded with
  /// `decodeIfPresent` so a legacy payload (no "quota_windows"/"stale_as_of")
  /// yields nil rather than a decode failure. All other keys keep synthesized
  /// behavior.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    accountId = try c.decode(String.self, forKey: .accountId)
    provider = try c.decode(String.self, forKey: .provider)
    displayName = try c.decodeIfPresent(String.self, forKey: .displayName)
    tier = try c.decodeIfPresent(String.self, forKey: .tier)
    paused = try c.decode(Bool.self, forKey: .paused)
    quotaPercentage = try c.decodeIfPresent(Double.self, forKey: .quotaPercentage)
    quotaStatus = try c.decode(String.self, forKey: .quotaStatus)
    nextReset = try c.decodeIfPresent(String.self, forKey: .nextReset)
    isDefault = try c.decode(Bool.self, forKey: .isDefault)
    lastActivityAt = try c.decodeIfPresent(String.self, forKey: .lastActivityAt)
    todayCost = try c.decodeIfPresent(Double.self, forKey: .todayCost)
    health = try c.decode(String.self, forKey: .health)
    cached = try c.decode(Bool.self, forKey: .cached)
    fetchedAt = try c.decodeIfPresent(String.self, forKey: .fetchedAt)
    needsReauth = try c.decode(Bool.self, forKey: .needsReauth)
    surface = try c.decodeIfPresent(String.self, forKey: .surface)
    profile = try c.decodeIfPresent(String.self, forKey: .profile)
    isSubscription = try c.decodeIfPresent(Bool.self, forKey: .isSubscription)
    quotaWindows = try c.decodeIfPresent([QuotaWindowDetail].self, forKey: .quotaWindows)
    staleAsOf = try c.decodeIfPresent(String.self, forKey: .staleAsOf)
  }
}

extension BarSummaryRow {
  /// Health rendered as an ASCII-safe dot for the dropdown.
  public var healthDot: String {
    switch health {
    case "error": return "X"
    case "warning": return "!"
    default: return "OK"
    }
  }
}
