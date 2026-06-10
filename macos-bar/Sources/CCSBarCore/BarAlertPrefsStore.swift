import Foundation

/// The persistence CONTRACT for alert preferences: the UserDefaults key strings,
/// their defaults, and a pure dictionary <-> prefs codec. The App layer owns the
/// live `UserDefaults` object; this type stays pure so the key/default/parse
/// logic is unit-testable on any toolchain without touching real defaults.
public enum BarAlertPrefsStore {
  /// UserDefaults keys. Stable strings — changing one silently drops a user's
  /// saved preference back to its default.
  public enum Key {
    public static let quotaEnabled = "ccsbar.alert.quota.enabled"
    public static let quotaLevels = "ccsbar.alert.quota.levels"
    public static let dailyEnabled = "ccsbar.alert.daily.enabled"
    public static let dailyCapUSD = "ccsbar.alert.daily.capUSD"
    public static let monthEnabled = "ccsbar.alert.month.enabled"
    public static let monthCapUSD = "ccsbar.alert.month.capUSD"
    public static let reauthEnabled = "ccsbar.alert.reauth.enabled"
    public static let cooldownPausedEnabled = "ccsbar.alert.cooldownPaused.enabled"
    public static let glanceMode = "ccsbar.glance.mode"
    /// Engine state, NOT user-editable.
    public static let firedKeys = "ccsbar.alert.firedKeys"
  }

  /// Default values keyed by the UserDefaults key. Registered via
  /// `UserDefaults.register(defaults:)` at App launch so absent Bool keys don't
  /// read back as `false` (which would silently disable every alert on first run).
  public static var registrationDefaults: [String: Any] {
    [
      Key.quotaEnabled: true,
      Key.quotaLevels: "20,10,0",
      Key.dailyEnabled: true,
      Key.dailyCapUSD: 500.0,
      Key.monthEnabled: true,
      Key.monthCapUSD: 10000.0,
      Key.reauthEnabled: true,
      Key.cooldownPausedEnabled: true,
      Key.glanceMode: BarGlanceMode.auto.rawValue,
    ]
  }

  /// Parse the comma-joined quota levels string into normalized `[Int]`:
  /// clamped 0...100, de-duplicated, sorted descending. Bad tokens are dropped.
  public static func parseQuotaLevels(_ raw: String) -> [Int] {
    let parsed = raw.split(separator: ",")
      .compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
      .map { min(100, max(0, $0)) }
    return Array(Set(parsed)).sorted(by: >)
  }

  /// Serialize quota levels back to the comma-joined storage form (sorted desc).
  public static func encodeQuotaLevels(_ levels: [Int]) -> String {
    levels.map { min(100, max(0, $0)) }.sorted(by: >).map(String.init).joined(separator: ",")
  }

  /// Decode a `BarAlertPrefs` from a plain `[key: value]` dictionary. Mirrors how
  /// the App will read each key from `UserDefaults`, but pure so it is testable.
  /// Missing keys fall back to the matching `BarAlertPrefs` default.
  public static func decode(from dict: [String: Any]) -> BarAlertPrefs {
    let d = BarAlertPrefs()  // carries the canonical defaults

    func bool(_ key: String, _ fallback: Bool) -> Bool { (dict[key] as? Bool) ?? fallback }
    func double(_ key: String, _ fallback: Double) -> Double {
      if let v = dict[key] as? Double { return v }
      if let v = dict[key] as? Int { return Double(v) }
      return fallback
    }

    let levels: [Int]
    if let raw = dict[Key.quotaLevels] as? String {
      let parsed = parseQuotaLevels(raw)
      levels = parsed.isEmpty ? d.quotaLevels : parsed
    } else {
      levels = d.quotaLevels
    }

    let mode = (dict[Key.glanceMode] as? String).flatMap(BarGlanceMode.init(rawValue:)) ?? d.glanceMode

    return BarAlertPrefs(
      quotaEnabled: bool(Key.quotaEnabled, d.quotaEnabled),
      quotaLevels: levels,
      dailySpendEnabled: bool(Key.dailyEnabled, d.dailySpendEnabled),
      dailyCapUSD: double(Key.dailyCapUSD, d.dailyCapUSD),
      monthSpendEnabled: bool(Key.monthEnabled, d.monthSpendEnabled),
      monthCapUSD: double(Key.monthCapUSD, d.monthCapUSD),
      reauthEnabled: bool(Key.reauthEnabled, d.reauthEnabled),
      cooldownPausedEnabled: bool(Key.cooldownPausedEnabled, d.cooldownPausedEnabled),
      glanceMode: mode)
  }

  /// Encode a `BarAlertPrefs` to the dictionary form the App writes to
  /// `UserDefaults` (levels comma-joined, mode as raw value).
  public static func encode(_ prefs: BarAlertPrefs) -> [String: Any] {
    [
      Key.quotaEnabled: prefs.quotaEnabled,
      Key.quotaLevels: encodeQuotaLevels(prefs.quotaLevels),
      Key.dailyEnabled: prefs.dailySpendEnabled,
      Key.dailyCapUSD: prefs.dailyCapUSD,
      Key.monthEnabled: prefs.monthSpendEnabled,
      Key.monthCapUSD: prefs.monthCapUSD,
      Key.reauthEnabled: prefs.reauthEnabled,
      Key.cooldownPausedEnabled: prefs.cooldownPausedEnabled,
      Key.glanceMode: prefs.glanceMode.rawValue,
    ]
  }
}
