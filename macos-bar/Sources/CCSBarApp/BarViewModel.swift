import Foundation
import SwiftUI
import CCSBarCore

/// Observable state for the menu bar. Holds the last-known rows for instant
/// paint, reconnects to the CCS web-server via the discovery file, and fires a
/// debounced force-refresh when the menu opens.
@MainActor
final class BarViewModel: ObservableObject {
  @Published var rows: [BarSummaryRow] = []
  @Published var analytics: BarAnalytics?
  @Published var offline = false
  @Published var lastError: String?
  @Published var isRefreshing = false
  @Published var iconStyle: BarIconStyle {
    didSet { MenuBarIcon.saveStyle(iconStyle) }
  }
  /// User-selected dropdown theme (System / Light / Dark). Global chrome, not an
  /// alert pref, so it persists on its own key and bypasses the draft/writeThrough
  /// path. Being @Published makes the MenuBarExtra re-render `ThemedRoot` the
  /// instant it changes, giving a live theme switch.
  @Published var appearance: BarAppearance {
    didSet { BarAppearanceStore.save(appearance) }
  }
  /// Which figure leads the always-on title. Persisted; a change re-derives
  /// `statusTitle` live because it is @Published.
  @Published var glanceMode: BarGlanceMode
  /// Render style for the spend sparkline (bars or line). Persisted via
  /// SpendChartStyleStore; didSet mirrors the BarAppearance/iconStyle pattern.
  @Published var spendChartStyle: SpendChartStyle {
    didSet { SpendChartStyleStore.save(spendChartStyle) }
  }
  /// The alerts the most recent evaluation wanted delivered, surfaced in the
  /// dropdown so users who deny notifications still see the conditions.
  @Published var activeAlerts: [BarNotification] = []

  private let home: String
  private var client: CCSBarClient?
  private var debouncer = RefreshDebouncer(interval: 15)
  /// Periodic background refresh so the glance self-heals from a transient
  /// server gap (e.g. a momentary backend restart that dropped the native rows)
  /// without the user having to reopen the menu. Cheap + safe: it reads the
  /// local server's caches and never hammers providers (native quota is
  /// TTL-gated server-side).
  private var pollTask: Task<Void, Never>?
  private let prefs: BarPreferences
  private let notifier: NotificationDelivering

  init(
    home: String = NSHomeDirectory(),
    prefs: BarPreferences = BarPreferences(),
    notifier: NotificationDelivering? = nil
  ) {
    self.home = home
    self.prefs = prefs
    // Seed registration defaults before the first pref read. Idempotent, and the
    // App-level call is a redundant safety net for the @StateObject default-init
    // ordering (stored-property defaults run before the App.init body).
    prefs.registerDefaults()
    // Default to the real UN-backed notifier; tests inject a recording one.
    self.notifier = notifier ?? BarNotifier()
    self.iconStyle = MenuBarIcon.loadStyle()
    self.appearance = BarAppearanceStore.load()
    self.glanceMode = prefs.load().glanceMode
    self.spendChartStyle = SpendChartStyleStore.load()
    reconnect()
    startBackgroundPolling()
  }

  /// Periodically re-poll for the app's lifetime so a transient empty/missing-row
  /// state recovers on its own within one interval — each tick reconnects if the
  /// client/discovery was lost, then loads (non-force, so it respects the
  /// server-side caches). This is what prevents the menu from getting stuck after
  /// the server momentarily restarts.
  private func startBackgroundPolling() {
    pollTask?.cancel()
    pollTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(60))
        guard let self else { return }
        await self.load(force: false)
      }
    }
  }

  /// Re-read prefs after the preferences sheet writes through, so the next poll
  /// (and the live title) reflects the change immediately.
  func reloadPrefs() {
    glanceMode = prefs.load().glanceMode
  }

  /// Toggle the menu-bar icon between the color mark and the mono template.
  func toggleIconStyle() {
    iconStyle = (iconStyle == .color) ? .mono : .color
  }

  /// Compact status-bar title, resolved through the user's chosen glance mode.
  var statusTitle: String {
    offline
      ? "CCS offline"
      : BarFormatting.statusTitle(rows: rows, analytics: analytics, mode: glanceMode)
  }

  /// Resolve the discovery file and (re)build the client. Marks offline when
  /// CCS hasn't been launched.
  func reconnect() {
    switch BarDiscovery.load(home: home) {
    case .success(let discovery):
      if let url = discovery.resolvedURL {
        client = CCSBarClient(baseURL: url)
        offline = false
      } else {
        client = nil
        offline = true
      }
    case .failure:
      client = nil
      offline = true
    }
  }

  /// Menu opened: cached rows are already on screen; fire a debounced
  /// force-refresh so the glance reflects live provider data.
  func onOpen() {
    let force = debouncer.shouldRefresh(now: Date())
    Task { await load(force: force) }
  }

  func load(force: Bool) async {
    if client == nil { reconnect() }
    guard let client else {
      offline = true
      return
    }
    if force { isRefreshing = true }
    defer { isRefreshing = false }
    do {
      rows = try await client.summary(refresh: force)
      offline = false
      lastError = nil
    } catch {
      lastError = describe(error)
      // Keep the last rows visible (instant cached paint); only flip to the
      // offline state when there is nothing to show.
      if rows.isEmpty { offline = true }
    }

    // Analytics is a best-effort side-load: a failure here must never blank the
    // glance or flip us offline. Keep the last-known analytics on error.
    if let fresh = try? await client.analytics() {
      analytics = fresh
    }

    evaluateAlerts()
  }

  /// Run the pure rule engine once per poll against the freshly-loaded state,
  /// deliver any new notifications, and overwrite the persisted fired-key set
  /// verbatim. The engine's dedupe means repeated polls with unchanged state
  /// deliver nothing, so this never spams. Delivery is best-effort and never
  /// blocks the UI (the notifier hops to its own task).
  private func evaluateAlerts() {
    let current = prefs.load()
    let eval = BarAlertEngine.evaluate(
      rows: rows,
      analytics: analytics,
      prefs: current,
      priorFiredKeys: prefs.firedKeys,
      now: Date())
    for notification in eval.toDeliver {
      notifier.deliver(notification)
    }
    // Persist the COMPLETE next-state set verbatim (no merge) — this is what keeps
    // the stored set bounded and lets cleared conditions re-arm.
    prefs.firedKeys = eval.firedKeys
    activeAlerts = eval.toDeliver
  }

  // MARK: Account actions

  func pause(_ row: BarSummaryRow) {
    perform { try await $0.pause(provider: row.provider, accountId: row.accountId) }
  }
  func resume(_ row: BarSummaryRow) {
    perform { try await $0.resume(provider: row.provider, accountId: row.accountId) }
  }
  func solo(_ row: BarSummaryRow) {
    perform { try await $0.solo(provider: row.provider, accountId: row.accountId) }
  }
  func setDefault(_ row: BarSummaryRow) {
    // The server's /api/accounts/default parses CLIProxy accounts as the
    // composite "provider:accountId" key; row.id already has that shape.
    // Sending the bare accountId fails parseCliproxyKey and 500s / no-ops.
    perform { try await $0.setDefault(name: row.id) }
  }
  func tierLock(_ row: BarSummaryRow, tier: String?) {
    perform { try await $0.tierLock(provider: row.provider, tier: tier) }
  }

  private func perform(_ op: @escaping (CCSBarClient) async throws -> Void) {
    guard let client else { return }
    Task {
      do {
        try await op(client)
        await load(force: true)
      } catch {
        lastError = describe(error)
      }
    }
  }

  private func describe(_ error: Error) -> String {
    String(describing: error)
  }
}
