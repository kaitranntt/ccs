import Foundation

// MARK: - BarLaunchDescriptor (written by ccs bar install / ccs bar, decoded by the Swift app)

/// Schema-versioned descriptor that tells the Swift app how to start the server
/// without a shell PATH. Stored at `~/.ccs/bar/launch.json`.
public struct BarLaunchDescriptor: Codable, Sendable {
  /// Schema version — always 1 for the current format.
  public let schema: Int
  /// Absolute path to the node/bun/runtime binary (`process.execPath`).
  public let runtime: String
  /// Arguments to pass to `runtime`: [absoluteEntryScript, "bar", "serve"].
  public let args: [String]
  /// Working directory for the spawned server (`os.homedir()`).
  public let home: String
  /// Value of `CCS_HOME` env var, if it was set when the descriptor was written.
  public let ccsHome: String?

  public init(schema: Int = 1, runtime: String, args: [String], home: String, ccsHome: String?) {
    self.schema = schema
    self.runtime = runtime
    self.args = args
    self.home = home
    self.ccsHome = ccsHome
  }

  /// Default path for the launch descriptor under `~/.ccs/bar/launch.json`.
  public static func defaultPath(home: String = NSHomeDirectory()) -> String {
    URL(fileURLWithPath: home)
      .appendingPathComponent(".ccs")
      .appendingPathComponent("bar")
      .appendingPathComponent("launch.json")
      .path
  }
}

// MARK: - BarServerProbe

/// Async port-probe that mirrors the TS `defaultFindRunningServer` order:
///   1. bar.json port (if available)
///   2. 3000, 3001, 3002, 8000, 8080
///   Each port is tried on 127.0.0.1 then ::1.
///   Liveness check: GET /api/bar/summary -> 200.
///
/// The transport is injectable so the check harness can test ordering without
/// a live server.
public struct BarServerProbe: Sendable {
  /// Fallback probe ports in order (after bar.json port).
  static let fallbackPorts = [3000, 3001, 3002, 8000, 8080]

  private let transport: HTTPTransport

  public init(transport: HTTPTransport = URLSessionTransport()) {
    self.transport = transport
  }

  /// Probe for a live CCS server. Returns the base URL of the first responding
  /// server, or `nil` if none respond within the attempt.
  ///
  /// - Parameter discovery: The current bar.json contents, if available.
  ///   Its port is probed first before the fallback list.
  public func findLiveServer(discovery: BarDiscovery?) async -> URL? {
    let candidatePorts = buildCandidatePorts(discovery: discovery)

    for port in candidatePorts {
      if let url = await probePort(port) {
        return url
      }
    }
    return nil
  }

  // MARK: - Private

  /// Build the ordered port list: bar.json port first (deduplicated), then fallbacks.
  private func buildCandidatePorts(discovery: BarDiscovery?) -> [Int] {
    var ports: [Int] = []
    if let d = discovery {
      ports.append(d.port)
    }
    for p in Self.fallbackPorts where !ports.contains(p) {
      ports.append(p)
    }
    return ports
  }

  /// Try 127.0.0.1 then ::1 for the given port.
  /// Returns the first base URL that responds 200 to /api/bar/summary, or nil.
  private func probePort(_ port: Int) async -> URL? {
    let hosts = ["127.0.0.1", "::1"]
    for host in hosts {
      // IPv6 addresses must be bracketed in URLs.
      let hostStr = host.contains(":") ? "[\(host)]" : host
      guard let base = URL(string: "http://\(hostStr):\(port)") else { continue }
      if await isLive(baseURL: base) {
        return base
      }
    }
    return nil
  }

  /// Returns true if GET {baseURL}/api/bar/summary responds with HTTP 200.
  private func isLive(baseURL: URL) async -> Bool {
    let url = baseURL.appendingPathComponent("api/bar/summary")
    var req = URLRequest(url: url)
    req.timeoutInterval = 2.0
    do {
      let (_, http) = try await transport.send(req)
      return http.statusCode == 200
    } catch {
      return false
    }
  }
}
