import AppKit
import CCSBarCore
import Foundation

/// Opens the CCS dashboard, starting the local server when it isn't running.
///
/// The dashboard is just a page served by the CCS web-server, so it can't load
/// if no server is up. When the discovered URL isn't reachable we launch
/// `ccs config`, which boots the server AND opens the dashboard in the browser
/// itself — so we must not also open it (that would double-open a tab).
enum DashboardLauncher {
  /// A GUI app does not inherit the shell PATH, so probe the common install
  /// locations for the `ccs` binary explicitly. First executable match wins.
  private static var ccsCandidates: [String] {
    let home = NSHomeDirectory()
    return [
      "\(home)/.bun/bin/ccs",
      "/opt/homebrew/bin/ccs",
      "/usr/local/bin/ccs",
      "\(home)/.local/bin/ccs",
      "\(home)/.npm-global/bin/ccs",
      "/usr/bin/ccs",
    ]
  }

  private static func ccsBinary() -> String? {
    ccsCandidates.first { FileManager.default.isExecutableFile(atPath: $0) }
  }

  private static func dashboardURL() -> URL? {
    if case .success(let discovery) = BarDiscovery.load() { return discovery.resolvedURL }
    return nil
  }

  /// Quick reachability probe so a stale `bar.json` URL doesn't send the user to
  /// a dead page. Short timeout — the dashboard is local.
  private static func isReachable(_ url: URL) async -> Bool {
    var request = URLRequest(url: url)
    request.httpMethod = "HEAD"
    request.timeoutInterval = 1.5
    return (try? await URLSession.shared.data(for: request)) != nil
  }

  @MainActor
  static func openOrStart() async {
    if let url = dashboardURL(), await isReachable(url) {
      NSWorkspace.shared.open(url)
      return
    }

    // Server isn't up. Start it via `ccs config`; it opens the dashboard on its
    // own. Avoid a shell here: candidate paths can include user-controlled
    // components, and Process can pass the executable and arguments directly.
    if let bin = ccsBinary() {
      let proc = Process()
      proc.executableURL = URL(fileURLWithPath: bin)
      proc.arguments = ["config"]
      let null = FileHandle(forWritingAtPath: "/dev/null")
      proc.standardOutput = null
      proc.standardError = null
      try? proc.run()
      return
    }

    // Can't find the ccs binary — best effort: open whatever URL we know so the
    // user at least lands on the right place (or sees the connection is refused).
    if let url = dashboardURL() {
      NSWorkspace.shared.open(url)
    }
  }
}
