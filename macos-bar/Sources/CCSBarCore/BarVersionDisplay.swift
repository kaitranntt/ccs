import Foundation

/// Pure helper for the version string shown in the bar panel header.
///
/// Kept tiny so it can be tested in CCSBarCheck without a bundle present:
/// the display-string logic is pure-Foundation and has no AppKit dependency.
public enum BarVersionDisplay {

  /// Converts a raw version string to a "v{version}" display string.
  ///
  /// - Returns: `"v\(raw)"` when `raw` is non-nil and non-empty; `nil` otherwise.
  ///
  /// This is the logic under test. The actual `Bundle.main` lookup is in `string()`.
  public static func displayString(for raw: String?) -> String? {
    guard let v = raw, !v.isEmpty else { return nil }
    return "v\(v)"
  }

  /// Returns the display string for the running app's bundle version, or `nil`
  /// when the key is absent (e.g. `swift run` outside a bundle).
  ///
  /// Never produces a dangling "v" prefix: if `CFBundleShortVersionString` is
  /// missing or empty, returns `nil` so the caller can omit the label entirely.
  public static func string() -> String? {
    let raw = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    return displayString(for: raw)
  }
}
