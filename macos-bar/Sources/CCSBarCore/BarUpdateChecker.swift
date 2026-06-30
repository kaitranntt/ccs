import Foundation

/// Lightweight update checker for CCS Bar.
///
/// Self-contained: the fetch is the only side effect. `isNewer` is pure and
/// unit-test-friendly with no bundle or network dependency.
public enum BarUpdateChecker {

  /// Published-version artifact URL. Stable redirect target maintained by the
  /// bar-release workflow; always points to the latest released version.txt.
  private static let versionURL = URL(
    string:
      "https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/version.txt"
  )!

  /// Validates that a string looks like a semver (permissive: pre-release
  /// suffixes after `-` are allowed but optional).
  private static let semverRegex = try! NSRegularExpression(
    pattern: #"^\d+\.\d+\.\d+([-.0-9A-Za-z]*)?$"#
  )

  // MARK: - Public API

  /// Fetches the latest published version string from the stable release URL.
  ///
  /// - Returns: A trimmed semver string (e.g. `"1.8.0"`) when the remote
  ///   returns HTTP 200 with a recognisable semver body; `nil` on any error,
  ///   timeout, non-200 status, or invalid body.
  /// - Never throws: all errors are swallowed and surfaced as `nil` so callers
  ///   never need a do/catch.
  public static func fetchLatestPublishedVersion() async -> String? {
    var request = URLRequest(url: versionURL)
    request.timeoutInterval = 8
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        return nil
      }
      guard let body = String(data: data, encoding: .utf8) else { return nil }
      let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
      guard isValidSemver(trimmed) else { return nil }
      return trimmed
    } catch {
      // Network errors, timeouts, cancellation — all silently nil.
      return nil
    }
  }

  /// Compares two semver strings and returns `true` when `latest` is strictly
  /// newer than `current`.
  ///
  /// - Strips any pre-release suffix (everything from the first `-` onward)
  ///   before comparing. Compares major, minor, patch as `Int`s.
  /// - Returns `false` on any malformed input.
  public static func isNewer(_ latest: String, than current: String) -> Bool {
    guard
      let latestParts = parseMajorMinorPatch(latest),
      let currentParts = parseMajorMinorPatch(current)
    else { return false }

    for (l, c) in zip(latestParts, currentParts) {
      if l > c { return true }
      if l < c { return false }
    }
    return false  // equal
  }

  // MARK: - Private helpers

  private static func isValidSemver(_ s: String) -> Bool {
    let range = NSRange(s.startIndex..., in: s)
    return semverRegex.firstMatch(in: s, range: range) != nil
  }

  /// Split a semver into [major, minor, patch], stripping any pre-release suffix.
  private static func parseMajorMinorPatch(_ version: String) -> [Int]? {
    // Strip pre-release suffix (anything from the first `-` onward).
    let core = version.split(separator: "-", maxSplits: 1).first.map(String.init) ?? version
    let parts = core.split(separator: ".").compactMap { Int($0) }
    guard parts.count >= 3 else { return nil }
    return [parts[0], parts[1], parts[2]]
  }
}
