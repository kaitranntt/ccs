import SwiftUI
import AppKit
import CCSBarCore

// MARK: - Content height preference key

/// Preference key used to bubble the measured content VStack height up to the
/// ScrollView parent. The reduction takes the MAX only to combine multiple
/// simultaneous reporters into one value (in practice a single background
/// GeometryReader reports here, so the max is just that reader's height). The
/// consumer (`onPreferenceChange`) then tracks the height in both directions so
/// the popover frame can shrink back when content collapses. This is safe from
/// the classic GeometryReader feedback loop because the reader measures the
/// intrinsic content VStack, whose height does not depend on the consumer frame.
private struct ContentHeightKey: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}

/// Dropdown content for the menu bar: a CCS-branded header, usage analytics,
/// per-account rows + actions, an offline state when CCS isn't running, and
/// footer controls.
struct BarMenuView: View {
  @ObservedObject var viewModel: BarViewModel
  /// Resolved theme injected by ThemedRoot — used to tint the armed Quit control
  /// with the themed red ramp so it matches the dropdown on both plates.
  @Environment(\.barTheme) private var theme
  /// Two-step inline quit confirm. First footer-Quit click arms it (icon swaps
  /// hollow->filled, tints red); second click terminates. Reset on every popover
  /// open via .onAppear so a stale armed state never carries across sessions —
  /// no modal, no .confirmationDialog (those steal focus and dismiss the popover,
  /// the exact fragility of BUG 1).
  @State private var quitArmed = false
  /// Measured height of the scroll content VStack, updated via preference key.
  /// Starts at 0; the preference fires on the first layout pass and grows
  /// monotonically (ContentHeightKey.reduce takes the max), so the frame never
  /// thrashes downward.
  @State private var contentHeight: CGFloat = 0
  /// Multi-profile carousel: which provider page is currently visible. Resets to
  /// first provider on popover re-open (KISS — no UserDefaults persistence needed).
  // Per-provider carousel position: provider -> selected profile row id. Each
  // provider has its own profile carousel, so selection is tracked per provider.
  @State private var selectedProfileByProvider: [String: String] = [:]

  // MARK: - Screen cap

  /// Maximum height the scroll area may occupy: screen visible height minus space
  /// for the macOS menu bar, the CCS Bar header, footer, and a small safety margin.
  /// Clamped to a floor of 240 so the popover is always usable even on tiny displays.
  private var screenCap: CGFloat {
    let visibleHeight = NSScreen.main?.visibleFrame.height ?? 800
    return max(240, visibleHeight - 120)
  }

  /// The resolved scroll-area height: the smaller of measured content and the cap.
  /// Content shorter than the cap renders FULLY with no scroll bar.
  /// Content taller than the cap scrolls.
  private var scrollAreaHeight: CGFloat {
    let cap = screenCap
    // Before the first measurement, use a modest default so the popover is never
    // sized to the full screen (which macOS then centers). Once the content is
    // measured, use its height, capped.
    guard contentHeight > 0 else { return min(cap, 560) }
    return min(contentHeight, cap)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      Divider()

      if viewModel.offline || viewModel.isStarting {
        offlineState.padding(14)
      } else {
        // The scroll indicator is suppressed (.never, not just .hidden) AND the
        // enclosing NSScrollView's scroller is hard-disabled via ScrollerHider:
        // inside a MenuBarExtra popover the SwiftUI preference alone is sometimes
        // ignored and a scroller track steals width + misaligns content. With the
        // reorder + collapsed spend strip the important rows fit without scrolling
        // for the common 1-4 subscription setup; the scroll only engages for
        // genuine pool/model overflow.
        ScrollView {
          VStack(alignment: .leading, spacing: 12) {
            // (1) UPDATE BANNER — shown only when a newer version is available.
            // Placed at the very top so it is seen without scrolling.
            if viewModel.updateAvailable {
              updateBanner
            }

            // (2) ALERTS — urgent quota crossings surface above accounts.
            // Spend-cap alerts are opt-in OFF by default, so by default only
            // quota/reauth/cooldown conditions appear here.
            if !viewModel.activeAlerts.isEmpty {
              VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Alerts")
                ForEach(viewModel.activeAlerts) { alert in
                  AlertRow(alert: alert)
                }
              }
            }

            // (3) SUBSCRIPTIONS — the dominant section, opens here.
            accountsSection

            // (4) SPEND — demoted to a thin informational strip below the cockpit.
            // spendChartStyle and spendPeriod are threaded from the viewModel and
            // toggled/selected inline from the Spend header so changes are live.
            if let analytics = viewModel.analytics {
              Divider()
              BarAnalyticsView(
                analytics: analytics, section: .spend,
                spendChartStyle: viewModel.spendChartStyle,
                onToggleSpendStyle: {
                  viewModel.spendChartStyle =
                    viewModel.spendChartStyle == .bars ? .line : .bars
                },
                spendPeriod: viewModel.spendPeriod,
                onSelectPeriod: { viewModel.spendPeriod = $0 })
            }

            // (5) POOL ACCOUNTS — compact generic rows, subordinate.
            poolSection

            // (6) BY-SURFACE / TOP MODELS — tightened detail, below the pool.
            if let analytics = viewModel.analytics,
              BarAnalyticsView(analytics: analytics, section: .breakdown).hasBreakdown
            {
              BarAnalyticsView(analytics: analytics, section: .breakdown)
            }

            // Zero-size AppKit bridge that disables the popover's NSScrollView
            // scroller at runtime (belt-and-suspenders with .scrollIndicators).
            ScrollerHider().frame(width: 0, height: 0)
          }
          .padding(14)
          // Measure the content height via a background GeometryReader that
          // reports into ContentHeightKey. Using .background keeps the reader
          // out of the layout pass that sizes the VStack itself, avoiding the
          // classic GeometryReader-inside-ScrollView feedback loop.
          .background(
            GeometryReader { geo in
              Color.clear
                .preference(key: ContentHeightKey.self, value: geo.size.height)
            }
          )
        }
        .scrollIndicators(.never)
        // Deterministic height: exactly the content size up to the screen cap.
        // Content shorter than the cap renders FULLY (no empty space, no clip).
        // Content taller scrolls. contentHeight starts at 0 so we show screenCap
        // until the first preference fires.
        .frame(height: scrollAreaHeight, alignment: .top)
        .onPreferenceChange(ContentHeightKey.self) { measured in
          // Track the measured content height in BOTH directions so the popover
          // collapses back when content shrinks (e.g. alert / reauth rows clear)
          // instead of staying stuck at a past peak and rendering blank space
          // below. The background GeometryReader measures the intrinsic content
          // VStack, whose height does not depend on this frame, so updating in
          // either direction cannot feed the classic GeometryReader layout loop.
          // The 0.5pt deadband avoids churn on sub-pixel remeasures.
          if abs(measured - contentHeight) > 0.5 {
            contentHeight = measured
          }
        }
      }

      Divider()
      footer
    }
    // 360 is narrower than the old 380, keeping the popover compact while still
    // fitting the bar-list fixed column widths (label 32 + bar 110 + pct 32 + chip 48).
    .frame(width: 360)
    .onAppear {
      viewModel.onOpen()
      // Disarm quit on every popover open so a stale armed state never persists.
      quitArmed = false
      // Reset each provider's carousel to its first profile on every open — KISS,
      // no persistence needed.
      selectedProfileByProvider = [:]
    }
  }

  /// "Update available" banner. Shown when `viewModel.updateAvailable` is true.
  /// Styled to match the existing AlertRow / ErrorBanner patterns (tinted
  /// background card, section label, borderless button).
  @ViewBuilder private var updateBanner: some View {
    VStack(alignment: .leading, spacing: 8) {
      SectionLabel("Update")
      HStack(spacing: 10) {
        Image(systemName: "arrow.down.circle.fill")
          .foregroundStyle(theme.accent)
          .font(.title3)
        VStack(alignment: .leading, spacing: 2) {
          Text("Update available")
            .font(.system(.caption, design: .default).weight(.semibold))
          if let v = viewModel.latestVersion {
            Text("CCS Bar \(v)")
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
        }
        Spacer(minLength: 4)
        if viewModel.isInstallingUpdate {
          HStack(spacing: 4) {
            ProgressView().controlSize(.mini)
            Text("Updating...")
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
        } else {
          Button("Update Now") {
            viewModel.installUpdate()
          }
          .buttonStyle(.borderless)
          .font(.caption.weight(.medium))
          .foregroundStyle(theme.accent)
        }
      }
      .padding(.vertical, 6)
      .padding(.horizontal, 10)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(theme.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
    }
  }

  /// The cockpit. Native subscriptions (Claude Code / Codex) render as detailed
  /// `BarSubscriptionCard`s at the very top, ordered tightest-binding-first
  /// (closest to empty on top) so the window the user is about to run out of
  /// leads. CLIProxy pool accounts keep the compact generic `BarRowView` below,
  /// subordinate. The two-section split is suppressed when only one kind is
  /// present, preserving the single "Accounts" header for a CLIProxy-only setup.
  @ViewBuilder private var accountsSection: some View {
    let parts = BarFormatting.partitionSubscriptions(viewModel.rows)
    VStack(alignment: .leading, spacing: 6) {
      if let error = viewModel.lastError {
        ErrorBanner(message: error)
      }
      if viewModel.rows.isEmpty {
        SectionLabel("Accounts")
        Text("No accounts configured")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else if parts.subscriptions.isEmpty {
        // CLIProxy-only setup: keep the single established header + generic rows.
        SectionLabel("Accounts")
        ForEach(parts.pool) { row in
          BarRowView(row: row, viewModel: viewModel)
        }
      } else {
        // Per-provider profile carousels: group subscription rows by provider, and
        // render each provider as its OWN horizontally-paged carousel of PROFILE
        // cards — one profile visible at a time, swipe left/right between that
        // provider's profiles, page dots indicate count. Provider sections stack
        // vertically. A provider with a single profile shows just its card (no
        // carousel, no dots).
        let groups = Dictionary(
          grouping: orderedSubscriptions(parts.subscriptions), by: { $0.provider })
        let providers = groups.keys.sorted()  // stable: "claude-code" < "codex"
        let multiProvider = providers.count > 1
        subscriptionsHeader(parts.subscriptions)
        ForEach(providers, id: \.self) { prov in
          let rows = groups[prov] ?? []
          VStack(alignment: .leading, spacing: 4) {
            // Provider caption to delineate sections when more than one provider.
            if multiProvider {
              Text(BarFormatting.providerLabel(prov))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            }
            if rows.count <= 1 {
              // Single profile — render the card directly, no carousel.
              if let row = rows.first {
                BarSubscriptionCard(
                  row: row, isParked: row.paused,
                  onRefresh: { viewModel.forceRefresh() })
              }
            } else {
              ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                  ForEach(rows) { row in
                    BarSubscriptionCard(
                      row: row, isParked: row.paused,
                      onRefresh: { viewModel.forceRefresh() })
                      // Each card spans exactly the horizontal scroll viewport so
                      // .paging snaps to one whole card per page. A fixed width
                      // wider than the viewport (the 360 popover minus the content
                      // VStack's 14pt padding leaves ~332pt) drifts a few points on
                      // every page and leaves the card stuck off-center after
                      // paging forward and back. containerRelativeFrame keeps the
                      // card width == viewport width, so paging stays aligned and
                      // the card is centered like the single-profile card.
                      .containerRelativeFrame(.horizontal)
                      .id(row.id)
                  }
                }
                // scrollTargetLayout on the HStack (the paging container) snaps to
                // each profile card on .paging behavior.
                .scrollTargetLayout()
              }
              .scrollTargetBehavior(.paging)
              .scrollPosition(id: Binding(
                get: { selectedProfileByProvider[prov] ?? rows.first?.id },
                set: { selectedProfileByProvider[prov] = $0 ?? rows.first?.id }))
              .frame(height: carouselHeight(rows))
              // Page controls — clickable prev/next arrows + dots so the carousel
              // is navigable by MOUSE (click), not just by trackpad swipe.
              // Programmatically setting the scrollPosition binding pages the
              // ScrollView; withAnimation gives the same feel as a swipe.
              carouselControls(prov: prov, rows: rows)
            }
          }
        }
      }
    }
  }

  /// CLIProxy pool accounts as compact generic rows — subordinate, rendered below
  /// the spend strip. Suppressed entirely when there are no pool accounts, or
  /// when there are no subscriptions (the CLIProxy-only path renders pool rows
  /// under the single "Accounts" header in `accountsSection` instead).
  @ViewBuilder private var poolSection: some View {
    let parts = BarFormatting.partitionSubscriptions(viewModel.rows)
    if !parts.subscriptions.isEmpty && !parts.pool.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        SectionLabel("Pool accounts")
        ForEach(parts.pool) { row in
          BarRowView(row: row, viewModel: viewModel)
        }
      }
    }
  }

  /// "SUBSCRIPTIONS" header, with a right-aligned cross-tool headroom hint
  /// ("most room: <X> NN%") when there are >=2 subscriptions with quota data.
  /// Falls back to the bare label otherwise.
  @ViewBuilder private func subscriptionsHeader(_ subs: [BarSummaryRow]) -> some View {
    HStack(alignment: .firstTextBaseline) {
      SectionLabel("Subscriptions")
      Spacer()
      if let leader = BarQuotaGauge.headroomLeader(subs) {
        Text("most room: \(leader.label) \(Int(leader.remainingPercent.rounded()))%")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
  }

  /// Order subscription cards so the default/base account leads its provider
  /// carousel (it is the account the user runs by default), then by tightest
  /// binding window ascending (closest to empty next). Rows with no binding
  /// window (error/reauth) sink to the bottom so actionable quota leads.
  private func orderedSubscriptions(_ subs: [BarSummaryRow]) -> [BarSummaryRow] {
    subs.sorted { a, b in
      // Default account first within its provider group.
      if a.isDefault != b.isDefault { return a.isDefault }
      let ra = BarQuotaGauge.selectBindingWindow(a.quotaWindows ?? [])?.remainingPercent
      let rb = BarQuotaGauge.selectBindingWindow(b.quotaWindows ?? [])?.remainingPercent
      switch (ra, rb) {
      case let (.some(x), .some(y)):
        if x != y { return x < y }
        return (a.displayName ?? a.provider) < (b.displayName ?? b.provider)
      case (.some, .none):
        return true  // a has quota, b doesn't → a first
      case (.none, .some):
        return false
      case (.none, .none):
        return (a.displayName ?? a.provider) < (b.displayName ?? b.provider)
      }
    }
  }

  /// Prev/next arrows + clickable dots for a provider's profile carousel, so it
  /// is navigable by MOUSE (click), not only by trackpad swipe. Selecting a page
  /// sets the scrollPosition binding, which scrolls the ScrollView to that card.
  @ViewBuilder private func carouselControls(prov: String, rows: [BarSummaryRow]) -> some View {
    let currentId = selectedProfileByProvider[prov] ?? rows.first?.id
    let curIdx = rows.firstIndex(where: { $0.id == currentId }) ?? 0
    HStack(spacing: 7) {
      pageArrow(systemName: "chevron.left", enabled: curIdx > 0) {
        if curIdx > 0 { selectPage(prov, rows[curIdx - 1].id) }
      }
      ForEach(rows) { row in
        Circle()
          .fill(currentId == row.id ? theme.subscription : Color.secondary.opacity(0.3))
          .frame(width: 6, height: 6)
          .padding(4)  // larger mouse hit target than the 6pt dot
          .contentShape(Rectangle())
          .onTapGesture { selectPage(prov, row.id) }
      }
      pageArrow(systemName: "chevron.right", enabled: curIdx < rows.count - 1) {
        if curIdx < rows.count - 1 { selectPage(prov, rows[curIdx + 1].id) }
      }
    }
    .frame(maxWidth: .infinity, alignment: .center)
  }

  /// Animate the carousel to the given profile card (mouse click or dot tap).
  private func selectPage(_ prov: String, _ id: String) {
    withAnimation(.easeInOut(duration: 0.2)) {
      selectedProfileByProvider[prov] = id
    }
  }

  @ViewBuilder private func pageArrow(
    systemName: String, enabled: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: systemName)
        .font(.system(size: 9, weight: .bold))
        .frame(width: 16, height: 16)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .opacity(enabled ? 0.7 : 0.25)
  }

  /// Height of the tallest single card in a carousel — only one card is visible
  /// at a time, so the paged frame is sized to fit it WITHOUT reserving blank
  /// space beneath. Card = vertical padding (16) + title row (~22) + one bar per
  /// quota window (~20) + an optional stale footnote (~16); a parked/reauth card
  /// is just the title row plus a one-line status.
  private func carouselHeight(_ rows: [BarSummaryRow]) -> CGFloat {
    let maxWindows = rows.map { $0.quotaWindows?.count ?? 0 }.max() ?? 0
    if maxWindows == 0 { return 60 }
    let hasFootnote = rows.contains { $0.staleAsOf != nil }
    return 40 + CGFloat(maxWindows) * 20 + (hasFootnote ? 16 : 0)
  }

  private var header: some View {
    HStack(spacing: 8) {
      Image(nsImage: MenuBarIcon.headerImage())
      VStack(alignment: .leading, spacing: 0) {
        Text("CCS").font(.headline)
        Text("usage & accounts").font(.caption2).foregroundStyle(.secondary)
      }
      Spacer()
      if viewModel.isRefreshing {
        ProgressView().controlSize(.small)
      }
      if let v = BarVersionDisplay.string() {
        Text(v)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
  }

  /// Offline / starting state view. Two sub-states:
  ///
  /// **Starting** (`isStarting == true`): server launch is in progress. Shows a
  /// spinner row so the user knows something is happening. No action needed.
  ///
  /// **Truly offline** (`offline == true`, `isStarting == false`): server is not
  /// running and no launch is in progress. Shows a primary "Start CCS" button
  /// that triggers the launcher + poll sequence, a secondary "Retry" that
  /// re-probes without launching, and a guidance caption.
  ///
  /// All controls remain inside the popover — NO sheets, modals, or
  /// .confirmationDialog (those steal focus and auto-dismiss the MenuBarExtra,
  /// the known constraint noted throughout BarMenuView).
  @ViewBuilder private var offlineState: some View {
    if viewModel.isStarting {
      // Starting state: spinner + label. Primary action is implicit (wait).
      HStack(spacing: 8) {
        ProgressView()
          .controlSize(.small)
        Text("Starting CCS…")
          .font(.body)
          .foregroundStyle(.secondary)
      }
    } else {
      // Truly offline state: actionable controls.
      VStack(alignment: .leading, spacing: 8) {
        Label("CCS is not running", systemImage: "bolt.slash.fill")
          .font(.body)
        Text("Start CCS, then the menu will connect automatically.")
          .font(.caption)
          .foregroundStyle(.secondary)
        HStack(spacing: 8) {
          // Primary: launches the server (reads launch.json or falls back to ccs on PATH).
          Button("Start CCS") {
            viewModel.startCCS()
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.small)
          // Secondary: re-probe only (no launch attempt).
          Button("Retry") {
            viewModel.onOpen()
          }
          .controlSize(.small)
        }
      }
    }
  }

  private var footer: some View {
    HStack(spacing: 12) {
      Button {
        openDashboard()
      } label: {
        Label("Dashboard", systemImage: "chart.bar.xaxis")
      }
      Button {
        viewModel.toggleIconStyle()
      } label: {
        Label(
          "Icon",
          systemImage: viewModel.iconStyle == .color ? "paintpalette" : "circle.lefthalf.filled"
        )
      }
      .help("Toggle the menu-bar icon between color and monochrome (does not change the bar theme)")
      Button {
        // Open Settings as a standalone AppKit NSWindow (NOT a .sheet on this
        // popover). A sheet hosted in a .window-style MenuBarExtra popover pulls
        // focus off the popover and auto-dismisses the whole bar (BUG 1). The
        // window opens beside the popover and leaves it untouched.
        SettingsWindowController.shared.show(viewModel: viewModel)
      } label: {
        Label("Settings", systemImage: "gearshape")
      }
      .help("Settings — appearance/theme, menu-bar glance, and alerts")
      Spacer()
      Button {
        viewModel.forceRefresh()
      } label: {
        Image(systemName: "arrow.clockwise")
      }
      .help("Refresh")
      // Quit confirms via a two-step INLINE arm/confirm — no modal, no sheet, no
      // .confirmationDialog. Those all steal focus and auto-dismiss the popover
      // (the exact fragility of BUG 1). A stray single click can no longer kill
      // the app: the first click only arms; the popover stays open and responsive.
      quitButton
    }
    .buttonStyle(.borderless)
    .font(.caption)
    .padding(.horizontal, 14)
    .padding(.vertical, 11)
  }

  /// Two visual states in one footer slot. Disarmed: hollow power icon that arms
  /// on click. Armed: filled power icon tinted themed red that terminates on
  /// click. Reopening the popover disarms it (.onAppear on the root VStack).
  @ViewBuilder private var quitButton: some View {
    if !quitArmed {
      Button {
        quitArmed = true
      } label: {
        Image(systemName: "power")
      }
      .help("Quit CCS Bar (click again to confirm)")
    } else {
      Button {
        NSApplication.shared.terminate(nil)
      } label: {
        Image(systemName: "power.circle.fill")
      }
      .help("Click to confirm quit")
      .foregroundStyle(theme.bandRed)
    }
  }

  private func openDashboard() {
    // Open the dashboard if the server is up; otherwise start it via `ccs config`.
    Task { await DashboardLauncher.openOrStart() }
  }
}

/// One account row — the strongest section of the glance.
///
/// Top line: health dot, name, default/paused/reauth badges. Subline: provider +
/// tier chips, the honest tri-state quota label (NN% / "no quota" / "quota ?"),
/// and a per-account "Last active <date>" caption. Trailing: today's cost (or a
/// muted "no data" when unknown vs a real "$0.00"), a visible pause/resume
/// toggle, and the overflow menu (set-default / solo / tier-lock).
struct BarRowView: View {
  @Environment(\.barTheme) private var theme
  let row: BarSummaryRow
  @ObservedObject var viewModel: BarViewModel

  /// A native first-party subscription (Claude Code / Codex) — drives the
  /// distinct "subscription" badge + indigo provider chip.
  private var isNativeSubscription: Bool {
    BarFormatting.isNativeSubscription(row)
  }

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Circle()
        .fill(healthColor)
        .frame(width: 8, height: 8)
        .padding(.top, 5)

      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 7) {
          Text(row.displayName ?? row.accountId)
            .font(.system(.body, design: .default).weight(.medium))
            .lineLimit(1)
            .truncationMode(.middle)
          if row.isDefault {
            Chip("default", tint: theme.accent)
          }
          if row.paused {
            Chip("paused", tint: .secondary)
          }
          if row.needsReauth {
            Chip("reauth", tint: theme.bandRed)
          }
          if isNativeSubscription {
            Chip("subscription", tint: theme.subscription)
          }
        }
        HStack(spacing: 6) {
          Chip(
            BarFormatting.providerLabel(row.provider),
            tint: isNativeSubscription ? theme.subscription : theme.accent)
          if let tier = row.tier { Chip(tier, tint: .secondary) }
          QuotaGaugeView(
            percentage: row.quotaPercentage,
            status: row.quotaStatus,
            nextReset: row.nextReset)
        }
        if let lastActive = BarFormatting.lastActiveLabel(
          iso: row.lastActivityAt, daysSince: nil)
        {
          Text(lastActive)
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }

      Spacer(minLength: 4)

      VStack(alignment: .trailing, spacing: 3) {
        costView
        HStack(spacing: 2) {
          pauseToggle
          overflowMenu
        }
      }
    }
    .padding(.vertical, 8)
    .padding(.horizontal, 10)
    .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
  }

  /// Today's cost: a real "$x.xx" when known (including a genuine $0.00), a muted
  /// "no data" when the value is null (no usage record on a possibly-stale snapshot).
  @ViewBuilder private var costView: some View {
    if let cost = row.todayCost {
      Text(BarFormatting.money(cost))
        .font(.system(.caption, design: .monospaced))
        .foregroundStyle(.secondary)
    } else {
      Text("no data")
        .font(.caption2)
        .foregroundStyle(.tertiary)
    }
  }

  /// Visible primary action: one tap to pause or resume the account.
  private var pauseToggle: some View {
    Button {
      if row.paused { viewModel.resume(row) } else { viewModel.pause(row) }
    } label: {
      Image(systemName: row.paused ? "play.circle" : "pause.circle")
    }
    .buttonStyle(.borderless)
    .help(row.paused ? "Resume account" : "Pause account")
  }

  private var overflowMenu: some View {
    Menu {
      Button("Set as default") { viewModel.setDefault(row) }
      Button("Solo (pause others)") { viewModel.solo(row) }
      Divider()
      if let tier = row.tier {
        Button("Lock to \(tier)") { viewModel.tierLock(row, tier: tier) }
      }
      Button("Clear tier lock") { viewModel.tierLock(row, tier: nil) }
    } label: {
      Image(systemName: "ellipsis.circle")
    }
    .menuStyle(.borderlessButton)
    .menuIndicator(.hidden)
    .frame(width: 24)
  }

  /// Health dot. With the corrected backend, "unsupported" providers (ghcp/kiro)
  /// arrive as health "ok" (green) — no permanent orange dot. Orange is reserved
  /// for genuine transient fetch failures, red for accounts needing reauth.
  private var healthColor: Color {
    // Use the themed band ramp (not raw system .red/.orange/.green) so the dot
    // matches the rest of the dropdown and stays legible on both plates.
    switch row.health {
    case "error": return theme.bandRed
    case "warning": return theme.bandAmber
    default: return theme.bandGreen
    }
  }
}

/// Per-account quota gauge. When the row has a live "ok" quota with a percentage,
/// renders a thin colored bar (filled by the remaining fraction, tinted by the
/// severity band) plus a "resets in …" caption. When there is no live quota it
/// falls back to the honest text label ("no quota" / "quota ?"). All branch,
/// color, and countdown logic lives in the pure Core `BarQuotaGauge`; this view
/// is a thin render.
struct QuotaGaugeView: View {
  @Environment(\.barTheme) private var theme
  let percentage: Double?
  let status: String
  let nextReset: String?

  var body: some View {
    let band = BarQuotaGauge.band(percentage: percentage, status: status)
    if band != .none, let fill = BarQuotaGauge.fillFraction(percentage: percentage, status: status) {
      HStack(spacing: 5) {
        gaugeBar(fill: fill, color: color(for: band))
        Text(BarFormatting.quotaLabel(percentage: percentage, status: status))
          .font(.system(.caption2, design: .monospaced))
          .foregroundStyle(color(for: band))
        if let countdown = BarQuotaGauge.resetCountdown(nextReset: nextReset, now: Date()) {
          Text(countdown)
            .font(.caption2)
            .foregroundStyle(.tertiary)
            .lineLimit(1)
        }
      }
    } else {
      // No live quota: keep the existing honest text ("no quota" / "quota ?").
      Text(BarFormatting.quotaLabel(percentage: percentage, status: status))
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
  }

  private func gaugeBar(fill: Double, color: Color) -> some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule()
          .fill(Color.primary.opacity(0.12))
        Capsule()
          .fill(color)
          .frame(width: max(2, geo.size.width * fill))
      }
    }
    .frame(width: 54, height: 6)
  }

  private func color(for band: BarQuotaGauge.Band) -> Color {
    // Themed band ramp for whole-dropdown consistency. .orange maps to the coral
    // band (the warning step in the green→amber→coral→red ramp) so it stays
    // distinct from the brand accent orange on both plates.
    switch band {
    case .green: return theme.bandGreen
    case .yellow: return theme.bandAmber
    case .orange: return theme.bandCoral
    case .red: return theme.bandRed
    case .none: return .secondary
    }
  }
}

/// Inline banner surfacing the last failed action so it is visible rather than
/// silently swallowed. Success is confirmed by the default/paused badge updating.
struct ErrorBanner: View {
  @Environment(\.barTheme) private var theme
  let message: String
  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(theme.accent)
      Text(message)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(2)
    }
    .padding(.vertical, 5)
    .padding(.horizontal, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(theme.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 7))
  }
}

/// One in-dropdown alert row. Mirrors a delivered notification so the conditions
/// are visible even when system notifications are denied. The icon is keyed off
/// the alert kind so each rule reads at a glance.
struct AlertRow: View {
  @Environment(\.barTheme) private var theme
  let alert: BarNotification

  var body: some View {
    HStack(alignment: .top, spacing: 6) {
      Image(systemName: icon)
        .foregroundStyle(tint)
        .font(.caption)
        .padding(.top, 1)
      VStack(alignment: .leading, spacing: 1) {
        Text(alert.title)
          .font(.caption.weight(.medium))
        Text(alert.body)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 5)
    .padding(.horizontal, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 7))
  }

  private var icon: String {
    switch alert.kind {
    case .quotaRemainingBelow: return "gauge.with.dots.needle.bottom.0percent"
    case .dailySpendAbove, .monthSpendAbove: return "dollarsign.circle"
    case .reauthNeeded: return "key.slash"
    case .accountCooldownOrPaused: return "pause.circle"
    }
  }

  private var tint: Color {
    // Themed: quota warnings take the brand accent, reauth the critical band,
    // so alert chips match the rest of the dropdown on both plates.
    switch alert.kind {
    case .quotaRemainingBelow: return theme.accent
    case .dailySpendAbove, .monthSpendAbove: return theme.accent
    case .reauthNeeded: return theme.bandRed
    case .accountCooldownOrPaused: return .secondary
    }
  }
}

/// Small pill label used in account sublines.
struct Chip: View {
  @Environment(\.colorScheme) private var colorScheme
  let text: String
  let tint: Color
  init(_ text: String, tint: Color) {
    self.text = text
    self.tint = tint
  }
  /// Lift the small 9pt label toward the opposite of the surface so it stays
  /// legible: toward white on the dark plate (the raw indigo subscription tint
  /// was too dim to read), toward black on the light plate (lifting toward white
  /// there would wash the text out). The forced scheme is already in effect on
  /// this subtree, so `colorScheme` reflects exactly the plate being drawn.
  private var textColor: Color {
    if tint == .secondary { return .secondary }
    let target: NSColor = (colorScheme == .light) ? .black : .white
    let lifted = NSColor(tint).blended(withFraction: 0.5, of: target) ?? NSColor(tint)
    return Color(nsColor: lifted)
  }
  var body: some View {
    Text(text)
      .font(.system(size: 10, weight: .semibold))
      .padding(.horizontal, 5)
      .padding(.vertical, 1.5)
      .background(tint.opacity(0.22), in: Capsule())
      .foregroundStyle(textColor)
  }
}
