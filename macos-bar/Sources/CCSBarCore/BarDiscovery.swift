import Foundation

/// Connection handshake the app reads to find the running CCS web-server.
///
/// Written by `ccs bar launch` to `~/.ccs/bar.json`. v1 only supports
/// `authMode == "loopback"` (dashboard auth disabled, localhost).
public struct BarDiscovery: Codable, Sendable, Equatable {
  public let baseUrl: String
  public let port: Int
  public let authMode: String

  public init(baseUrl: String, port: Int, authMode: String) {
    self.baseUrl = baseUrl
    self.port = port
    self.authMode = authMode
  }

  enum CodingKeys: String, CodingKey {
    case baseUrl
    case port
    case authMode
  }

  /// Resolved base URL, falling back to a localhost URL built from `port`
  /// when `baseUrl` is empty or unparseable.
  public var resolvedURL: URL? {
    if let url = URL(string: baseUrl), url.scheme != nil { return url }
    return URL(string: "http://127.0.0.1:\(port)")
  }

  public enum LoadError: Error, Equatable {
    case missing(path: String)
    case unreadable(path: String)
    case malformed
  }

  /// Default discovery file path under the given home directory.
  public static func defaultPath(home: String = NSHomeDirectory()) -> String {
    URL(fileURLWithPath: home)
      .appendingPathComponent(".ccs")
      .appendingPathComponent("bar.json")
      .path
  }

  /// Load discovery from `~/.ccs/bar.json`. Returns a typed error when the
  /// file is absent (CCS not launched) or malformed so the UI can show a
  /// clear "CCS offline" state instead of crashing.
  public static func load(home: String = NSHomeDirectory()) -> Result<BarDiscovery, LoadError> {
    let path = defaultPath(home: home)
    guard FileManager.default.fileExists(atPath: path) else {
      return .failure(.missing(path: path))
    }
    guard let data = FileManager.default.contents(atPath: path) else {
      return .failure(.unreadable(path: path))
    }
    guard let discovery = try? JSONDecoder().decode(BarDiscovery.self, from: data) else {
      return .failure(.malformed)
    }
    return .success(discovery)
  }
}
