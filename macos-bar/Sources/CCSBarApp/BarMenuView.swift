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
  /// Live horizontal drag translation per provider while a swipe is in progress.
  /// Reset to 0 (and committed to a page change) on drag release. Keyed by
  /// provider so each carousel tracks its own in-flight swipe independently.
  @State private var dragByProvider: [String: CGFloat] = [:]
  /// Whether the Alerts section is expanded to show every alert. Collapsed by
  /// default: only the most-severe few render, with a "+N more" toggle, so a
  /// burst of conditions never buries the cockpit under a wall of rows.
  @State private var alertsExpanded = false

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
            // quota/reauth/cooldown conditions appear here. Deduped, severity-
            // ranked, compact, and collapsed past a few — see alertsSection.
            if !viewModel.activeAlerts.isEmpty {
              alertsSection
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
      // no persistence needed. Clear any in-flight drag and re-collapse alerts.
      selectedProfileByProvider = [:]
      dragByProvider = [:]
      alertsExpanded = false
    }
  }

  /// "Update available" banner. Shown when `viewModel.updateAvailable` is true.
  /// Styled to match the existing CompactAlertRow / ErrorBanner patterns (tinted
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
              profileCarousel(prov: prov, rows: rows)
              // Page controls — clickable prev/next arrows + dots so the carousel
              // is also navigable by MOUSE click, not only by drag/swipe.
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

  /// Swipeable profile pager: one full-width card visible at a time, an HStack of
  /// the provider's cards offset to the current page. Two complementary inputs
  /// move between pages so no device is left out:
  ///   - a `DragGesture` for a mouse/trackpad press-drag (the previous ScrollView
  ///     never paged on a plain mouse click-drag), committing on release past a
  ///     20% threshold, with the ends rubber-banding so an over-drag resists;
  ///   - a `CarouselScrollPager` overlay that turns a non-clicking horizontal
  ///     trackpad / Magic Mouse swipe (delivered as scroll-wheel events, which a
  ///     DragGesture does not see) into a page step.
  /// No ScrollView, so there is no paging drift and the card is always centered.
  @ViewBuilder private func profileCarousel(prov: String, rows: [BarSummaryRow]) -> some View {
    let currentId = selectedProfileByProvider[prov] ?? rows.first?.id
    let curIdx = rows.firstIndex(where: { $0.id == currentId }) ?? 0
    GeometryReader { geo in
      let pageWidth = geo.size.width
      HStack(spacing: 0) {
        ForEach(rows) { row in
          BarSubscriptionCard(
            row: row, isParked: row.paused,
            onRefresh: { viewModel.forceRefresh() })
            .frame(width: pageWidth)
        }
      }
      .offset(x: -CGFloat(curIdx) * pageWidth + (dragByProvider[prov] ?? 0))
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 8)
          .onChanged { value in
            // Rubber-band at the ends: an over-drag past the first/last card moves
            // at a third the rate so it springs back instead of revealing a gap.
            let raw = value.translation.width
            let atStart = curIdx == 0 && raw > 0
            let atEnd = curIdx == rows.count - 1 && raw < 0
            dragByProvider[prov] = (atStart || atEnd) ? raw / 3 : raw
          }
          .onEnded { value in
            // Commit a page change when the swipe passes 20% of the page width;
            // otherwise snap back to the current card.
            let threshold = pageWidth * 0.2
            var newIdx = curIdx
            if value.translation.width <= -threshold { newIdx = min(curIdx + 1, rows.count - 1) }
            else if value.translation.width >= threshold { newIdx = max(curIdx - 1, 0) }
            withAnimation(.easeOut(duration: 0.2)) {
              dragByProvider[prov] = 0
              selectedProfileByProvider[prov] = rows[newIdx].id
            }
          }
      )
      // Trackpad / Magic Mouse horizontal swipe (scroll-wheel events) → page step.
      // Transparent to clicks and to the DragGesture; only observes scroll.
      .overlay(
        CarouselScrollPager { step in page(prov: prov, by: step, rows: rows) }
      )
    }
    .frame(height: carouselHeight(rows))
    .clipped()  // hide the neighbouring cards that sit outside the page viewport
  }

  /// Step the given provider's carousel by ±1 page, clamped to the ends. Used by
  /// the horizontal scroll-swipe overlay; the arrows/dots call `selectPage`
  /// directly.
  private func page(prov: String, by step: Int, rows: [BarSummaryRow]) {
    let currentId = selectedProfileByProvider[prov] ?? rows.first?.id
    let curIdx = rows.firstIndex(where: { $0.id == currentId }) ?? 0
    let newIdx = min(max(curIdx + step, 0), rows.count - 1)
    if newIdx != curIdx { selectPage(prov, rows[newIdx].id) }
  }

  /// Prev/next arrows + clickable dots for a provider's profile carousel, so it
  /// is navigable by MOUSE click, not only by drag/swipe. Selecting a page sets
  /// `selectedProfileByProvider`, which animates the pager offset to that card.
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

  // MARK: Alerts

  /// One displayed alert after de-duplication: the representative notification
  /// plus how many identical conditions it stands for (e.g. the same "ck needs
  /// re-authentication" firing on two surfaces collapses to one row with ×2).
  private struct GroupedAlert: Identifiable {
    let id: String
    let alert: BarNotification
    let count: Int
  }

  /// De-duplicate alerts by their visible text and rank by severity so the most
  /// actionable condition leads. Two alerts that render identically (same title +
  /// body) collapse into one group with a count, killing the "ck reauth" /
  /// "ck reauth" / "ck paused" / "ck paused" repetition seen with multi-surface
  /// profiles.
  private func groupedAlerts(_ alerts: [BarNotification]) -> [GroupedAlert] {
    var order: [String] = []
    var byKey: [String: (alert: BarNotification, count: Int)] = [:]
    for a in alerts {
      let key = a.title + "\u{1F}" + a.body
      if let hit = byKey[key] {
        byKey[key] = (hit.alert, hit.count + 1)
      } else {
        byKey[key] = (a, 1)
        order.append(key)
      }
    }
    return order
      .map { GroupedAlert(id: $0, alert: byKey[$0]!.alert, count: byKey[$0]!.count) }
      .sorted { alertSeverityRank($0.alert.kind) < alertSeverityRank($1.alert.kind) }
  }

  /// Severity order for alert ranking: reauth (account unusable) first, spend
  /// caps next, then quota, then the soft paused/cooldown note.
  private func alertSeverityRank(_ kind: BarAlertKind) -> Int {
    switch kind {
    case .reauthNeeded: return 0
    case .dailySpendAbove, .monthSpendAbove: return 1
    case .quotaRemainingBelow: return 2
    case .accountCooldownOrPaused: return 3
    }
  }

  /// Calm, compact alerts: a labelled header with a total count, then a few
  /// single-line rows (most-severe first). Collapsed past `collapsedCap` behind a
  /// "+N more" toggle so a burst of conditions never floods the popover. Replaces
  /// the previous stack of tall two-line cards.
  @ViewBuilder private var alertsSection: some View {
    let groups = groupedAlerts(viewModel.activeAlerts)
    let collapsedCap = 3
    let overflow = groups.count - collapsedCap
    let visible = alertsExpanded ? groups : Array(groups.prefix(collapsedCap))
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 6) {
        SectionLabel("Alerts")
        Text("\(groups.count)")
          .font(.system(size: 10, weight: .semibold))
          .padding(.horizontal, 5)
          .padding(.vertical, 1)
          .background(Color.secondary.opacity(0.18), in: Capsule())
          .foregroundStyle(.secondary)
        Spacer(minLength: 0)
      }
      ForEach(visible) { g in
        CompactAlertRow(alert: g.alert, count: g.count)
      }
      if overflow > 0 {
        Button {
          withAnimation(.easeInOut(duration: 0.15)) { alertsExpanded.toggle() }
        } label: {
          HStack(spacing: 4) {
            Image(systemName: alertsExpanded ? "chevron.up" : "chevron.down")
              .font(.system(size: 9, weight: .bold))
            Text(alertsExpanded ? "Show less" : "\(overflow) more")
              .font(.caption2)
          }
          .foregroundStyle(.secondary)
          .padding(.vertical, 2)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
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

/// Compact, single-line alert row used by the condensed Alerts section. One
/// glanceable line — kind icon + the self-describing body (the title is dropped
/// as redundant with the icon) + an optional ×N when several identical
/// conditions were merged. The tint is softer than the old `AlertRow` card so a
/// list of them reads as informative, not alarming.
struct CompactAlertRow: View {
  @Environment(\.barTheme) private var theme
  let alert: BarNotification
  let count: Int

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: icon)
        .foregroundStyle(tint)
        .font(.caption2)
        .frame(width: 12)
      Text(alert.body)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .truncationMode(.tail)
      if count > 1 {
        Text("×\(count)")
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 4)
    .padding(.horizontal, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
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

/// Adds horizontal trackpad / Magic Mouse swipe paging to the profile carousel.
/// SwiftUI's `DragGesture` handles a mouse or trackpad press-drag, but a
/// non-clicking two-finger swipe arrives as scroll-wheel events it never sees.
///
/// This hosts a transparent AppKit anchor view (click- and drag-transparent via
/// a nil `hitTest`, so it never blocks the cards' buttons or the DragGesture) and
/// a local scroll-wheel monitor scoped to that view's on-screen frame. A
/// predominantly horizontal scroll pages once per gesture; a vertical scroll is
/// passed straight through so the popover still scrolls. If the frame math ever
/// fails to match, the worst case is that scroll-swipe simply does nothing —
/// drag and the arrows/dots still work — so the failure mode is benign.
struct CarouselScrollPager: NSViewRepresentable {
  /// Called with +1 (next) or -1 (previous) when a horizontal swipe commits.
  let onPage: (Int) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(onPage: onPage) }

  func makeNSView(context: Context) -> NSView {
    let view = PassthroughView()
    context.coordinator.attach(to: view)
    return view
  }

  func updateNSView(_ nsView: NSView, context: Context) {
    context.coordinator.onPage = onPage
  }

  static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
    coordinator.detach()
  }

  /// Anchor view that is transparent to all mouse hit-testing, so clicks and the
  /// SwiftUI DragGesture pass through to the cards beneath it.
  final class PassthroughView: NSView {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
  }

  /// Owns the local scroll-wheel monitor and the per-gesture accumulator.
  final class Coordinator {
    var onPage: (Int) -> Void
    private weak var view: NSView?
    private var monitor: Any?
    private var accumulated: CGFloat = 0
    private var firedThisGesture = false
    private let threshold: CGFloat = 40

    init(onPage: @escaping (Int) -> Void) { self.onPage = onPage }

    func attach(to view: NSView) {
      self.view = view
      monitor = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel]) { [weak self] event in
        self?.handle(event) ?? event
      }
    }

    func detach() {
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
    }

    /// Return nil to consume a horizontal swipe inside the carousel; return the
    /// event unchanged otherwise so vertical popover scroll is never swallowed.
    private func handle(_ event: NSEvent) -> NSEvent? {
      guard let view, let window = view.window, event.window === window else { return event }
      let frameInWindow = view.convert(view.bounds, to: nil)
      guard frameInWindow.contains(event.locationInWindow) else { return event }

      let dx = event.scrollingDeltaX
      let dy = event.scrollingDeltaY
      guard abs(dx) > abs(dy) else { return event }  // vertical → let the popover scroll

      if event.phase.contains(.began) || event.momentumPhase.contains(.began) {
        accumulated = 0
        firedThisGesture = false
      }
      accumulated += dx
      if !firedThisGesture && abs(accumulated) >= threshold {
        firedThisGesture = true
        // Natural scrolling: content moving left (negative dx) advances to next.
        onPage(accumulated < 0 ? 1 : -1)
      }
      if event.phase.contains(.ended) || event.momentumPhase.contains(.ended) {
        accumulated = 0
        firedThisGesture = false
      }
      return nil
    }
  }
}
