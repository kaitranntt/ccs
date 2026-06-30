import SwiftUI
import CCSBarCore

/// Preferences sheet reachable from the dropdown footer. Lets the user pick the
/// menu-bar glance mode and toggle / tune each alert rule. Writes through to
/// UserDefaults on every change and tells the view model to re-read prefs so the
/// title updates live and the next poll re-evaluates with the new settings.
struct BarPreferencesView: View {
  @ObservedObject var viewModel: BarViewModel
  let prefs: BarPreferences
  @Environment(\.barTheme) private var theme

  // Local editable mirror of the persisted prefs. Loaded on appear; each change
  // is written through immediately so there is no separate "save" step.
  @State private var draft = BarAlertPrefs()
  // Quota levels are edited as free text and parsed on commit; keeping the raw
  // string in @State avoids fighting the user's keystrokes mid-edit.
  @State private var levelsText = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      Divider()
      Form {
        appearanceSection
        glanceSection
        updatesSection
        quotaSection
        spendSection
        accountSection
        deliveryHint
      }
      .formStyle(.grouped)
      Divider()
      footer
    }
    // Fill the hosting window responsively (it is a real resizable NSWindow now,
    // not a fixed 360x460 sheet) so there are no dead margins and resizing works.
    .frame(minWidth: 420, idealWidth: 460, maxWidth: .infinity,
           minHeight: 520, idealHeight: 600, maxHeight: .infinity)
    .onAppear(perform: hydrate)
  }

  private var header: some View {
    HStack(spacing: 8) {
      Image(systemName: "bell.badge")
        .foregroundStyle(theme.accent)
      Text("Alerts & Glance").font(.headline)
      Spacer()
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
  }

  /// Theme + chart style. Appearance affects the whole dropdown; chart style is
  /// scoped to the spend sparkline. Both are bound directly to viewModel properties
  /// whose `didSet` persist — no writeThrough() needed here.
  private var appearanceSection: some View {
    Section("Appearance") {
      Picker("Menu bar theme", selection: $viewModel.appearance) {
        Text("System").tag(BarAppearance.system)
        Text("Light").tag(BarAppearance.light)
        Text("Dark").tag(BarAppearance.dark)
      }
      .pickerStyle(.segmented)
      // Spend graph bars/line is toggled inline in the dropdown's Spend header,
      // not here — kept out of Settings so the choice lives where the chart is.
    }
  }

  private var glanceSection: some View {
    Section("Menu-bar glance") {
      Picker("Show in menu bar", selection: $draft.glanceMode) {
        ForEach(BarGlanceMode.allCases, id: \.self) { mode in
          Text(glanceLabel(mode)).tag(mode)
        }
      }
      .onChange(of: draft.glanceMode) { _ in writeThrough() }
    }
  }

  /// Auto-update check toggle. Bound directly to the UserDefaults-backed pref
  /// via the same write-through pattern used for quota/spend toggles.
  private var updatesSection: some View {
    Section("Updates") {
      Toggle(
        "Check for CCS Bar updates automatically",
        isOn: Binding(
          get: { prefs.autoCheckUpdates },
          set: { prefs.autoCheckUpdates = $0 }
        )
      )
    }
  }

  private var quotaSection: some View {
    Section("Quota") {
      Toggle("Alert on low quota", isOn: $draft.quotaEnabled)
        .onChange(of: draft.quotaEnabled) { _ in writeThrough() }
      HStack {
        Text("Levels (%)")
        Spacer()
        TextField("20,10,0", text: $levelsText)
          .multilineTextAlignment(.trailing)
          .frame(width: 120)
          .onSubmit { commitLevels() }
      }
      .disabled(!draft.quotaEnabled)
      Text("Fires once per account at the most-severe level crossed, then again after the next quota reset.")
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
  }

  /// Pay-per-use spend caps. Opt-in (OFF by default) and labelled for pool
  /// accounts, NOT subscriptions: flat-rate subscription plans have no spend to
  /// cap, so these alerts only make sense for metered pool usage.
  private var spendSection: some View {
    Section("Opt-in · pay-per-use spend") {
      Toggle("Daily spend cap (pool accounts)", isOn: $draft.dailySpendEnabled)
        .onChange(of: draft.dailySpendEnabled) { _ in writeThrough() }
      capRow(label: "Daily cap", value: $draft.dailyCapUSD, enabled: draft.dailySpendEnabled)

      Toggle("Monthly spend cap (pool accounts)", isOn: $draft.monthSpendEnabled)
        .onChange(of: draft.monthSpendEnabled) { _ in writeThrough() }
      capRow(label: "Month cap", value: $draft.monthCapUSD, enabled: draft.monthSpendEnabled)
      Text("Subscriptions are flat-rate and unaffected. These caps only watch metered pay-per-use pool spend, and are off until you enable them.")
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
  }

  private var accountSection: some View {
    Section("Account state") {
      Toggle("Alert when an account needs re-auth", isOn: $draft.reauthEnabled)
        .onChange(of: draft.reauthEnabled) { _ in writeThrough() }
      Toggle("Alert when an account is paused / cooling down", isOn: $draft.cooldownPausedEnabled)
        .onChange(of: draft.cooldownPausedEnabled) { _ in writeThrough() }
    }
  }

  /// Always-present delivery note. We don't synchronously read the live UN
  /// authorization state here (it's async and ad-hoc signing makes the prompt
  /// land late), so rather than a flickering "denied" branch we tell the user
  /// where alerts surface either way: as system notifications when allowed, and
  /// always in the in-menu alert list.
  private var deliveryHint: some View {
    Section {
      HStack(spacing: 6) {
        Image(systemName: "info.circle")
          .foregroundStyle(.secondary)
        Text("Alerts show as system notifications when allowed (System Settings › Notifications) and always appear in the menu's Alerts list.")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }

  private func capRow(label: String, value: Binding<Double>, enabled: Bool) -> some View {
    HStack {
      Text(label)
      Spacer()
      Text("$")
        .foregroundStyle(.secondary)
      TextField("0", value: value, format: .number)
        .multilineTextAlignment(.trailing)
        .frame(width: 90)
        .onSubmit { writeThrough() }
        .onChange(of: value.wrappedValue) { _ in writeThrough() }
    }
    .disabled(!enabled)
  }

  private var footer: some View {
    HStack {
      Spacer()
      Button("Done") { commitLevels(); SettingsWindowController.shared.close() }
        .keyboardShortcut(.defaultAction)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
  }

  // MARK: State plumbing

  private func hydrate() {
    draft = prefs.load()
    levelsText = BarAlertPrefsStore.encodeQuotaLevels(draft.quotaLevels)
  }

  /// Parse the free-text levels field into normalized ints, then persist.
  private func commitLevels() {
    let parsed = BarAlertPrefsStore.parseQuotaLevels(levelsText)
    if !parsed.isEmpty { draft.quotaLevels = parsed }
    // Reflect the normalized form back into the field so the user sees what stuck.
    levelsText = BarAlertPrefsStore.encodeQuotaLevels(draft.quotaLevels)
    writeThrough()
  }

  /// Save the current draft and ask the view model to re-read it so the live
  /// title + next evaluation pick up the change.
  private func writeThrough() {
    prefs.save(draft)
    viewModel.reloadPrefs()
  }

  private func glanceLabel(_ mode: BarGlanceMode) -> String {
    switch mode {
    case .auto: return "Auto (smart)"
    case .todaySpend: return "Today's spend"
    case .monthSpend: return "This month's spend"
    case .lowestQuota: return "Lowest quota"
    case .accountCount: return "Active account count"
    }
  }
}
