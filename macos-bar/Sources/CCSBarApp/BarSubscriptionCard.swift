import SwiftUI
import CCSBarCore

/// Dedicated card for a first-party subscription (Claude Code / Codex).
///
/// Design goal: bar-first, glanceable in under a second. Each quota window is
/// rendered as an aligned row:
///   <label>  [████████░░░░]  41%   9h 2m
///
/// The binding window (the one the subscription runs out of first) is
/// highlighted and is the only place where the at-risk pace warning appears.
/// Verbose prose lines ("week window · resets in ...") are removed entirely.
struct BarSubscriptionCard: View {
  @Environment(\.barTheme) private var theme
  let row: BarSummaryRow
  /// Injected clock — defaults to live Date() in production, pinned in previews
  /// and tests so countdown math is deterministic.
  var now: Date = Date()

  private var windows: [QuotaWindowDetail] { row.quotaWindows ?? [] }

  private var binding: QuotaWindowDetail? {
    BarQuotaGauge.selectBindingWindow(windows)
  }

  var body: some View {
    // spacing: 4 (down from 6) and vertical padding: 8 (down from 11) keep the
    // card compact so 2-3 cards fit in the dropdown without triggering scroll.
    VStack(alignment: .leading, spacing: 4) {
      titleRow
      if windows.isEmpty {
        emptyState
      } else {
        windowBarList
        staleFootnote
      }
    }
    .padding(.vertical, 8)
    .padding(.horizontal, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      theme.cardSurface,
      in: RoundedRectangle(cornerRadius: 9))
  }

  // MARK: Title row

  /// Health dot + product name + reauth chip + tier chip. No pause toggle —
  /// subscriptions are not routable pool accounts.
  private var titleRow: some View {
    HStack(spacing: 8) {
      Circle()
        .fill(healthColor)
        .frame(width: 8, height: 8)
      Text(BarFormatting.providerLabel(row.provider))
        .font(.system(.body, design: .default).weight(.semibold))
        .lineLimit(1)
      if row.needsReauth {
        Chip("reauth", tint: theme.bandRed)
      }
      Spacer(minLength: 4)
      if let tier = row.tier {
        Chip(tier, tint: theme.subscription)
      }
    }
  }

  // MARK: Window bar list

  /// All quota windows rendered as aligned bar rows, binding window highlighted.
  private var windowBarList: some View {
    // Ordered display: core windows first (5h, week), then Opus/Sonnet.
    let ordered = orderedWindows
    let bindingKey = binding?.key

    // spacing: 4 (down from 5) — rows are already compact; tighter gap fits more
    // without hurting legibility.
    return VStack(alignment: .leading, spacing: 4) {
      ForEach(ordered) { w in
        windowBarRow(w, isBinding: w.key == bindingKey)
      }
    }
  }

  /// Stable display order: five_hour → seven_day → seven_day_opus → seven_day_sonnet.
  private var orderedWindows: [QuotaWindowDetail] {
    windows.sorted { a, b in
      keyRank(a.key) < keyRank(b.key)
    }
  }

  private func keyRank(_ key: String) -> Int {
    switch key {
    case "five_hour": return 0
    case "seven_day": return 1
    case "seven_day_opus": return 2
    case "seven_day_sonnet": return 3
    default: return 4
    }
  }

  /// One bar row: short label | bar | remaining% | reset chip | [atRisk warning].
  ///
  /// Layout uses fixed column widths so bars across rows align vertically,
  /// making headroom comparisons instant.
  private func windowBarRow(_ w: QuotaWindowDetail, isBinding: Bool) -> some View {
    let band = BarQuotaGauge.band(percentage: w.remainingPercent, status: "ok")
    let fill = BarQuotaGauge.fillFraction(percentage: w.remainingPercent, status: "ok") ?? 0
    let barColor = color(for: band)
    let isAtRisk = isBinding && BarQuotaGauge.atRisk(
      usedPercent: w.usedPercent,
      remainingPercent: w.remainingPercent,
      resetAt: w.resetAt,
      windowMinutes: w.windowMinutes,
      now: now)

    return HStack(spacing: 0) {
      // Short label: max 5 chars to keep alignment tight.
      Text(shortLabel(for: w))
        .font(
          isBinding
            ? .system(.caption2, design: .monospaced).weight(.semibold)
            : .system(.caption2, design: .monospaced))
        .foregroundStyle(isBinding ? .primary : .secondary)
        .frame(width: 32, alignment: .leading)

      // Horizontal fill bar — wider than the old secondary thinBar so fine
      // gradations are visible. Remaining fraction fills from the left so a
      // full bar = healthy, an empty bar = exhausted.
      ZStack(alignment: .leading) {
        Capsule().fill(Color.primary.opacity(isBinding ? 0.14 : 0.09))
        Capsule()
          .fill(barColor)
          .frame(width: max(2, 110 * fill))
      }
      .frame(width: 110, height: isBinding ? 7 : 5)

      Spacer(minLength: 5)

      // Remaining percentage — monospaced so digits are column-stable.
      Text("\(Int(w.remainingPercent.rounded()))%")
        .font(.system(.caption2, design: .monospaced))
        .foregroundStyle(isBinding ? barColor : .secondary)
        .frame(width: 32, alignment: .trailing)

      Spacer(minLength: 5)

      // Compact reset chip — terse duration or calendar date.
      resetChip(for: w, isBinding: isBinding)

      // At-risk warning: shown only on the binding window when pace says we
      // will exhaust before the reset. Kept compact (⚠ + duration) so the
      // row does not blow out to a second line.
      if isAtRisk, let pace = paceWarningText(for: w) {
        Text(pace)
          .font(.system(.caption2, design: .monospaced))
          .foregroundStyle(theme.bandCoral)
          .lineLimit(1)
          .padding(.leading, 5)
      }
    }
  }

  /// Terse window label for the bar list, at most 4-5 chars:
  ///   five_hour          → "5h"
  ///   seven_day          → "wk"
  ///   seven_day_opus     → "Opus"
  ///   seven_day_sonnet   → "Son"
  ///
  /// Fall back to the backend-supplied label truncated to 5 chars so unknown
  /// future keys still render acceptably.
  private func shortLabel(for w: QuotaWindowDetail) -> String {
    switch w.key {
    case "five_hour": return "5h"
    case "seven_day": return "wk"
    case "seven_day_opus": return "Opus"
    case "seven_day_sonnet": return "Son"
    default:
      let s = w.label
      return s.count <= 5 ? s : String(s.prefix(4)) + "…"
    }
  }

  /// Compact reset chip: muted small text showing how long until the window
  /// refreshes. Uses BarCardFormatting.shortReset which delegates to Core's
  /// compactDuration for <24h durations (days-tier included).
  private func resetChip(for w: QuotaWindowDetail, isBinding: Bool) -> some View {
    Group {
      if let t = BarCardFormatting.shortReset(iso: w.resetAt, now: now) {
        Text(t)
          .font(.system(.caption2, design: .monospaced))
          .foregroundStyle(isBinding ? .secondary : .tertiary)
      }
    }
    .frame(width: 48, alignment: .trailing)
  }

  /// Extract the "~Th Mm" part from paceClause for the at-risk inline warning.
  /// Returns nil when paceClause returns nil or the limit-reached path fires
  /// (those are handled by the bar color, not an extra label).
  private func paceWarningText(for w: QuotaWindowDetail) -> String? {
    guard let clause = BarQuotaGauge.paceClause(
      usedPercent: w.usedPercent,
      remainingPercent: w.remainingPercent,
      resetAt: w.resetAt,
      windowMinutes: w.windowMinutes,
      status: row.quotaStatus,
      now: now),
      clause.hasPrefix("~")
    else { return nil }
    // Strip "left at this pace" suffix to keep the inline chip terse.
    // "~2h 30m left at this pace" → "⚠ ~2h 30m"
    let core = clause
      .replacingOccurrences(of: " left at this pace", with: "")
    return "⚠ \(core)"
  }

  // MARK: Stale footnote (Codex older-session data)

  /// "as of HH:mm (older session)" caption when the Codex reading came from an
  /// older session. The bar still renders — the data is real, just not live.
  @ViewBuilder private var staleFootnote: some View {
    if let stale = row.staleAsOf, let clock = BarCardFormatting.clockTime(iso: stale) {
      HStack(spacing: 4) {
        Image(systemName: "clock.arrow.circlepath")
          .font(.system(size: 9))
          .foregroundStyle(.tertiary)
        Text("as of \(clock), older session")
          .font(.caption2)
          .foregroundStyle(.tertiary)
      }
    }
  }

  // MARK: Empty / error state

  /// No quota windows (reauth / error row): plain status text, no bar.
  private var emptyState: some View {
    Text(
      row.needsReauth
        ? "reauth needed"
        : BarFormatting.quotaLabel(percentage: row.quotaPercentage, status: row.quotaStatus)
    )
    .font(.caption)
    .foregroundStyle(.secondary)
  }

  // MARK: Shared helpers

  private var healthColor: Color {
    switch row.health {
    case "error": return theme.bandRed
    case "warning": return theme.bandAmber
    default: return theme.bandGreen
    }
  }

  private func color(for band: BarQuotaGauge.Band) -> Color {
    switch band {
    case .green: return theme.bandGreen
    case .yellow: return theme.bandAmber
    case .orange: return theme.bandCoral
    case .red: return theme.bandRed
    case .none: return .secondary
    }
  }
}
