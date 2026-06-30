import Foundation
import CCSBarCore

/// Live UserDefaults adapter for the alert/glance preferences. The pure
/// key/default/parse contract lives in Core (`BarAlertPrefsStore`); this type is
/// the thin App-side bridge that reads/writes the real defaults suite.
///
/// `register(defaults:)` is called once at launch so that an absent Bool key does
/// NOT read back as `false` (which would silently disable every alert on a fresh
/// install). All reads go through `load()`; all writes go through `save(_:)`.
struct BarPreferences {
  let defaults: UserDefaults

  // MARK: - Update-check preference key

  /// UserDefaults key for the auto-update-check toggle.
  static let autoCheckUpdatesKey = "ccsBar.autoCheckUpdates"

  // MARK: - Init

  /// Default to the standard suite. A stable suite name is intentionally NOT used
  /// here because the rest of the app (MenuBarIcon) already persists to
  /// `.standard`; keeping one suite avoids split state across the two.
  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  // MARK: - Update preference

  /// Whether the app should periodically check for CCS Bar updates. Defaults to
  /// `true` — users who never open Settings still get update awareness.
  var autoCheckUpdates: Bool {
    get { defaults.bool(forKey: BarPreferences.autoCheckUpdatesKey) }
    nonmutating set { defaults.set(newValue, forKey: BarPreferences.autoCheckUpdatesKey) }
  }

  // MARK: - Registration

  /// Seed the registration domain so missing keys resolve to their real defaults
  /// rather than the type-zero value. Idempotent — safe to call on every launch.
  ///
  /// The two pay-per-use spend-cap alerts default to OFF (opt-in): subscriptions
  /// are flat-rate, so a spend alert on them is meaningless, and pool spend is
  /// informational context, never a default-on alert. Quota / reauth / cooldown
  /// stay default-on (the quota-first alert set). The caps themselves keep Core's
  /// sane values so a user who opts in starts with $500 / $10000.
  func registerDefaults() {
    var d = BarAlertPrefsStore.registrationDefaults
    d[BarAlertPrefsStore.Key.dailyEnabled] = false
    d[BarAlertPrefsStore.Key.monthEnabled] = false
    // autoCheckUpdates defaults to true — registered here so the Bool key is
    // never absent (absent Bool reads as false, which would silently opt-out).
    d[BarPreferences.autoCheckUpdatesKey] = true
    defaults.register(defaults: d)
  }

  /// Read the current preferences. Pulls each key into a plain dictionary and
  /// defers to the pure Core decoder so parsing/clamping stays in one place.
  func load() -> BarAlertPrefs {
    var dict: [String: Any] = [:]
    // Only forward keys that are actually present; the Core decoder fills the
    // rest from canonical defaults. `object(forKey:)` returns the registered
    // default when nothing was explicitly written, which is exactly what we want.
    dict[BarAlertPrefsStore.Key.quotaEnabled] = defaults.object(forKey: BarAlertPrefsStore.Key.quotaEnabled)
    dict[BarAlertPrefsStore.Key.quotaLevels] = defaults.object(forKey: BarAlertPrefsStore.Key.quotaLevels)
    dict[BarAlertPrefsStore.Key.dailyEnabled] = defaults.object(forKey: BarAlertPrefsStore.Key.dailyEnabled)
    dict[BarAlertPrefsStore.Key.dailyCapUSD] = defaults.object(forKey: BarAlertPrefsStore.Key.dailyCapUSD)
    dict[BarAlertPrefsStore.Key.monthEnabled] = defaults.object(forKey: BarAlertPrefsStore.Key.monthEnabled)
    dict[BarAlertPrefsStore.Key.monthCapUSD] = defaults.object(forKey: BarAlertPrefsStore.Key.monthCapUSD)
    dict[BarAlertPrefsStore.Key.reauthEnabled] = defaults.object(forKey: BarAlertPrefsStore.Key.reauthEnabled)
    dict[BarAlertPrefsStore.Key.cooldownPausedEnabled] =
      defaults.object(forKey: BarAlertPrefsStore.Key.cooldownPausedEnabled)
    dict[BarAlertPrefsStore.Key.glanceMode] = defaults.object(forKey: BarAlertPrefsStore.Key.glanceMode)
    return BarAlertPrefsStore.decode(from: dict.compactMapValues { $0 })
  }

  /// Persist the preferences, encoding levels comma-joined and mode as raw value.
  func save(_ prefs: BarAlertPrefs) {
    for (key, value) in BarAlertPrefsStore.encode(prefs) {
      defaults.set(value, forKey: key)
    }
  }

  // MARK: Fired-key engine state (NOT user-editable)

  /// The engine's persisted fired-key set. Overwritten verbatim each poll with
  /// `BarAlertEvaluation.firedKeys` so the stored set stays bounded.
  var firedKeys: Set<String> {
    get { Set(defaults.stringArray(forKey: BarAlertPrefsStore.Key.firedKeys) ?? []) }
    nonmutating set { defaults.set(Array(newValue), forKey: BarAlertPrefsStore.Key.firedKeys) }
  }
}
