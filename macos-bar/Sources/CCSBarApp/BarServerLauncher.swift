import Foundation
#if os(Linux)
import Glibc
#else
import Darwin
#endif
import CCSBarCore

/// Reads `~/.ccs/bar/launch.json` and spawns the CCS bar server detached,
/// redirecting stdout/stderr to `~/.ccs/bar/serve.log`.
///
/// If `launch.json` is absent the launcher falls back to resolving `ccs` on
/// PATH via `/bin/zsh -lic "command -v ccs"` and spawning `ccs bar serve`.
///
/// This type is intentionally NOT on the main actor: `Process` is blocking and
/// must never run on the main thread. Explicit `Sendable` is safe because the
/// only stored property is an immutable `String`.
struct BarServerLauncher: Sendable {
  let home: String

  init(home: String = NSHomeDirectory()) {
    self.home = home
  }

  // MARK: - Public

  /// Attempt to start the CCS bar server.
  /// Returns `true` when the process was successfully spawned (detached),
  /// `false` when the launch is not possible (no descriptor, no ccs on PATH).
  /// This does NOT wait for the server to become reachable — callers must
  /// poll BarServerProbe after calling start().
  @discardableResult
  func start() -> Bool {
    if let descriptor = loadDescriptor() {
      return spawnFromDescriptor(descriptor)
    }
    return spawnFallback()
  }

  // MARK: - Descriptor loading

  private func loadDescriptor() -> BarLaunchDescriptor? {
    let path = BarLaunchDescriptor.defaultPath(home: home)
    guard isSafeDescriptorFile(path),
      let data = FileManager.default.contents(atPath: path),
      let descriptor = try? JSONDecoder().decode(BarLaunchDescriptor.self, from: data),
      isSafeDescriptor(descriptor)
    else { return nil }
    return descriptor
  }

  /// Treat launch.json as untrusted because it lives under a user-writable CCS
  /// directory. Refuse symlinks, files not owned by the current user, and files
  /// writable by group/other before decoding executable details.
  private func isSafeDescriptorFile(_ path: String) -> Bool {
    let fm = FileManager.default
    guard fm.fileExists(atPath: path) else { return false }

    guard let linkValues = try? URL(fileURLWithPath: path).resourceValues(forKeys: [.isSymbolicLinkKey]),
      linkValues.isSymbolicLink != true,
      let attrs = try? fm.attributesOfItem(atPath: path),
      (attrs[.type] as? FileAttributeType) == .typeRegular,
      let owner = attrs[.ownerAccountID] as? NSNumber,
      owner.uint32Value == getuid(),
      let permissions = attrs[.posixPermissions] as? NSNumber
    else { return false }

    // Disallow group/other write bits. User-writable is expected so CCS can refresh it.
    return (permissions.uint16Value & 0o022) == 0
  }

  /// Validate the descriptor schema and constrain it to the expected CCS bar
  /// server command shape: runtime absolute path + absolute entry point +
  /// exactly "bar serve". This blocks shell descriptors such as
  /// /bin/sh -c attacker-command while preserving the installed launch path.
  private func isSafeDescriptor(_ descriptor: BarLaunchDescriptor) -> Bool {
    guard descriptor.schema == 1, descriptor.args.count == 3 else { return false }
    guard descriptor.args[1] == "bar", descriptor.args[2] == "serve" else { return false }
    guard isAbsolutePath(descriptor.runtime), isAbsolutePath(descriptor.args[0]) else { return false }
    guard descriptor.home == home else { return false }
    if let ccsHome = descriptor.ccsHome, !ccsHome.isEmpty, !isAbsolutePath(ccsHome) {
      return false
    }

    let runtimeName = URL(fileURLWithPath: descriptor.runtime).lastPathComponent.lowercased()
    let allowedRuntimes: Set<String> = ["node", "nodejs", "bun"]
    guard allowedRuntimes.contains(runtimeName) else { return false }
    guard FileManager.default.isExecutableFile(atPath: descriptor.runtime) else { return false }

    let entry = descriptor.args[0]
    let entryName = URL(fileURLWithPath: entry).lastPathComponent.lowercased()
    guard entryName == "ccs.js" || entryName == "ccs.ts" else { return false }
    guard isSafeEntrypointFile(entry), !isUnderCcsDir(entry) else { return false }

    return true
  }

  private func isSafeEntrypointFile(_ path: String) -> Bool {
    guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
      (attrs[.type] as? FileAttributeType) == .typeRegular,
      let permissions = attrs[.posixPermissions] as? NSNumber
    else { return false }

    return (permissions.uint16Value & 0o022) == 0
  }

  private func isUnderCcsDir(_ path: String) -> Bool {
    let ccsPath = URL(fileURLWithPath: home)
      .appendingPathComponent(".ccs")
      .standardizedFileURL
      .path
    let targetPath = URL(fileURLWithPath: path).standardizedFileURL.path
    return targetPath == ccsPath || targetPath.hasPrefix(ccsPath + "/")
  }

  private func isAbsolutePath(_ path: String) -> Bool {
    path.hasPrefix("/")
  }

  // MARK: - Spawn from descriptor

  private func spawnFromDescriptor(_ descriptor: BarLaunchDescriptor) -> Bool {
    guard !descriptor.runtime.isEmpty, !descriptor.args.isEmpty else { return false }

    let logURL = serveLogURL()
    ensureLogDirectory()

    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: descriptor.runtime)
    // Drop the first arg (the entry point itself) when the runtime IS the
    // entry point; args[0] is the entry script, args[1..] are the remaining.
    // Per the plan: args = [absoluteEntryScript, "bar", "serve"].
    proc.arguments = Array(descriptor.args.dropFirst())

    // Prepend the entry script as the first positional arg to the runtime.
    // e.g. node /path/to/ccs.js bar serve
    if let first = descriptor.args.first {
      proc.arguments = [first] + (proc.arguments ?? [])
    }

    proc.currentDirectoryURL = URL(fileURLWithPath: descriptor.home)

    var env = ProcessInfo.processInfo.environment
    if let ccsHome = descriptor.ccsHome, !ccsHome.isEmpty {
      env["CCS_HOME"] = ccsHome
    }
    proc.environment = env

    attachLog(proc, logURL: logURL)
    return launchDetached(proc)
  }

  // MARK: - Fallback: resolve `ccs` then spawn

  private func spawnFallback() -> Bool {
    guard let ccsPath = resolveCCSPath() else { return false }

    let logURL = serveLogURL()
    ensureLogDirectory()

    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: ccsPath)
    proc.arguments = ["bar", "serve"]
    proc.currentDirectoryURL = URL(fileURLWithPath: home)
    proc.environment = ProcessInfo.processInfo.environment
    attachLog(proc, logURL: logURL)
    return launchDetached(proc)
  }

  /// Resolve the `ccs` binary path by running `/bin/zsh -lic "command -v ccs"`.
  /// Synchronous; called only when launch.json is absent.
  private func resolveCCSPath() -> String? {
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
    proc.arguments = ["-lic", "command -v ccs"]

    let pipe = Pipe()
    proc.standardOutput = pipe
    proc.standardError = Pipe()  // discard stderr

    guard (try? proc.run()) != nil else { return nil }
    proc.waitUntilExit()

    guard proc.terminationStatus == 0 else { return nil }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let raw = String(data: data, encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return raw.isEmpty ? nil : raw
  }

  // MARK: - Helpers

  /// URL for the serve log file: `~/.ccs/bar/serve.log`.
  private func serveLogURL() -> URL {
    URL(fileURLWithPath: home)
      .appendingPathComponent(".ccs")
      .appendingPathComponent("bar")
      .appendingPathComponent("serve.log")
  }

  /// Ensure `~/.ccs/bar/` directory exists before writing the log.
  private func ensureLogDirectory() {
    let dir = URL(fileURLWithPath: home)
      .appendingPathComponent(".ccs")
      .appendingPathComponent("bar")
      .path
    try? FileManager.default.createDirectory(
      atPath: dir, withIntermediateDirectories: true, attributes: nil)
  }

  /// Wire up stdout + stderr to the log file (appending). Creates the file if absent.
  private func attachLog(_ proc: Process, logURL: URL) {
    // Create or open the file for appending.
    if !FileManager.default.fileExists(atPath: logURL.path) {
      FileManager.default.createFile(atPath: logURL.path, contents: nil)
    }
    if let handle = try? FileHandle(forWritingTo: logURL) {
      handle.seekToEndOfFile()
      proc.standardOutput = handle
      proc.standardError = handle
    } else {
      // Fallback: discard output rather than block the launch.
      proc.standardOutput = FileHandle.nullDevice
      proc.standardError = FileHandle.nullDevice
    }
  }

  /// Launch `proc` detached (does not wait for it). Returns success/failure.
  private func launchDetached(_ proc: Process) -> Bool {
    do {
      try proc.run()
      // Do NOT call waitUntilExit() — the process must outlive this app launch.
      return true
    } catch {
      return false
    }
  }
}
