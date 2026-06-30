import SwiftUI
import CCSBarCore

/// Demoted spend strip + surface/model breakdown.
///
/// Spend is informational pool context, NEVER the headline — so the loud 2×2
/// StatCell grid + 28pt sparkline that used to dominate the dropdown collapses
/// into one muted caption line ("today $NN · 7d $N.Nk") with an optional thin
/// inline sparkline. The By-surface / Top-models breakdowns stay, tightened and
/// subordinate, below the pool accounts.
///
/// When the trailing 30 days carry no spend the strip reads the honest idle line
/// ("No usage in N days") instead of three dead "$0.00" cells.
struct BarAnalyticsView: View {
  @Environment(\.barTheme) private var theme
  let analytics: BarAnalytics
  /// Which slot of the dropdown this instance renders. `.spend` is the thin strip
  /// placed below the subscriptions cockpit; `.breakdown` is the by-surface /
  /// top-models detail placed below the pool accounts.
  enum Section { case spend, breakdown }
  var section: Section = .spend
  /// Controls whether the spend sparkline renders as bars or a line graph.
  /// Passed in by BarMenuView so it reflects the user's persisted choice live.
  var spendChartStyle: SpendChartStyle = .bars
  /// Inline flip for the spend chart style, surfaced as a small toggle in the
  /// Spend header (using the otherwise-blank space) so the user switches
  /// bars/line in place rather than digging into Settings. nil for `.breakdown`.
  var onToggleSpendStyle: (() -> Void)? = nil
  /// Selected time window for the spend chart. Default .last7d so the rolling
  /// 7-day view is the startup default, matching SpendPeriodStore's default.
  var spendPeriod: SpendPeriod = .last7d
  /// Callback when the user taps a period selector button. nil for .breakdown.
  var onSelectPeriod: ((SpendPeriod) -> Void)? = nil

  private var lastActive: String? {
    BarFormatting.lastActiveLabel(
      iso: analytics.lastActivityAt, daysSince: analytics.daysSinceLastActivity)
  }

  var body: some View {
    switch section {
    case .spend:
      spendStrip
    case .breakdown:
      breakdown
    }
  }

  /// By-surface + top-models detail, tightened and subordinate.
  @ViewBuilder private var breakdown: some View {
    VStack(alignment: .leading, spacing: 8) {
      // Surface breakdown: "how much Claude Code vs Codex" — only shown when
      // the backend supplies at least one surface entry. Top 5 keeps it compact.
      if !analytics.bySurface.isEmpty {
        SectionLabel("By surface")
        let peakSurface = analytics.bySurface.map(\.cost).max() ?? 1
        ForEach(analytics.bySurface.prefix(5)) { surface in
          SurfaceBar(surface: surface, peak: peakSurface)
        }
      }

      // Top models.
      if !analytics.topModels.isEmpty {
        let scope = analytics.topModelsWindow == "30d" ? "30d" : "all-time"
        SectionLabel("Top models · \(scope)")
        let peak = analytics.topModels.map(\.cost).max() ?? 1
        ForEach(analytics.topModels.prefix(4)) { model in
          ModelBar(model: model, peak: peak)
        }
      }
    }
  }

  /// True when there's any surface/model detail worth a divider + section.
  var hasBreakdown: Bool {
    !analytics.bySurface.isEmpty || !analytics.topModels.isEmpty
  }

  /// The informational spend strip: a "SPEND" label, period selector,
  /// bars/line toggle, a muted caption, a taller sparkline, and axis labels.
  private var spendStrip: some View {
    VStack(alignment: .leading, spacing: 5) {
      // Header row: section label | period selector | bars/line toggle.
      HStack(spacing: 6) {
        SectionLabel("Spend")
        Spacer()
        // Compact 3-segment period selector — only when there is data to chart,
        // so the idle state shows no controls that would have no visible effect.
        if let select = onSelectPeriod, analytics.hasRecentData {
          periodSelector(onSelect: select)
        }
        // Inline bars/line toggle — only when there is data to render.
        if let toggle = onToggleSpendStyle, analytics.hasRecentData, !sparklineIsEmpty {
          Button(action: toggle) {
            Image(
              systemName: spendChartStyle == .bars
                ? "chart.line.uptrend.xyaxis" : "chart.bar.fill"
            )
            .font(.system(size: 10))
          }
          .buttonStyle(.borderless)
          .foregroundStyle(.tertiary)
          .help("Spend graph: switch to \(spendChartStyle == .bars ? "line" : "bars")")
        }
      }

      if analytics.hasRecentData {
        Text(spendCaption)
          .font(.caption2)
          .foregroundStyle(.secondary)
        // height: 56 — more room so per-hour or per-day gradations are readable.
        Sparkline(values: activeSeries, accent: theme.accent, style: spendChartStyle)
          .frame(height: 56)
        // Axis labels below the chart, aligned to the same width.
        axisLabelRow
      } else {
        Text(idleCaption)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }

  /// Small 3-button period selector: "Today / 7d / 30d".
  private func periodSelector(onSelect: @escaping (SpendPeriod) -> Void) -> some View {
    HStack(spacing: 4) {
      periodButton("Today", period: .today, onSelect: onSelect)
      periodButton("7d", period: .last7d, onSelect: onSelect)
      periodButton("30d", period: .last30d, onSelect: onSelect)
    }
  }

  private func periodButton(
    _ label: String, period: SpendPeriod, onSelect: @escaping (SpendPeriod) -> Void
  ) -> some View {
    Button(label) { onSelect(period) }
      .buttonStyle(.borderless)
      .font(
        spendPeriod == period
          ? .system(size: 10, weight: .semibold)
          : .system(size: 10))
      .foregroundStyle(spendPeriod == period ? theme.accent : Color.secondary)
  }

  /// The value series for the currently-selected period.
  private var activeSeries: [Double] {
    switch spendPeriod {
    case .today:
      return analytics.byHour.map(\.cost)
    case .last7d:
      return Array(analytics.byDay.suffix(7)).map(\.cost)
    case .last30d:
      return analytics.byDay.map(\.cost)
    }
  }

  /// Caption showing the cost for the active period. Each period sums the SAME
  /// series it charts so the caption total always matches the visible bars.
  private var spendCaption: String {
    switch spendPeriod {
    case .today:
      // Sum byHour (the charted series) so caption == bars. Fall back to the
      // daily today total only when there is no hourly series to draw.
      let cost =
        analytics.byHour.isEmpty
        ? analytics.today.cost
        : analytics.byHour.reduce(0) { $0 + $1.cost }
      return "today \(BarFormatting.money(cost))"
    case .last7d:
      let cost = Array(analytics.byDay.suffix(7)).reduce(0) { $0 + $1.cost }
      return "7d \(BarFormatting.money(cost))"
    case .last30d:
      return "30d \(BarFormatting.money(analytics.last30d.cost))"
    }
  }

  /// Axis labels rendered below the sparkline. Each tick is placed at its data
  /// point's horizontal fraction (bar-center) so the label sits under the hour /
  /// day it names — not merely evenly distributed, which drifts on the Today
  /// view where the tick indices aren't at even fractions of the width. Edge
  /// labels are clamped inward by their estimated half-width so they don't clip.
  @ViewBuilder private var axisLabelRow: some View {
    let ticks = axisTicks(for: spendPeriod)
    if !ticks.isEmpty {
      GeometryReader { geo in
        let width = Double(geo.size.width)
        ForEach(Array(ticks.enumerated()), id: \.offset) { _, tick in
          // ~2.75pt per char at 9pt monospaced is half a glyph; clamp keeps the
          // first/last labels fully on-screen.
          let halfW = max(8.0, Double(tick.label.count) * 2.75)
          let x = min(max(tick.fraction * width, halfW), max(halfW, width - halfW))
          Text(tick.label)
            .font(.system(size: 9, design: .monospaced))
            .foregroundStyle(.tertiary)
            .lineLimit(1)
            .fixedSize()
            .position(x: x, y: 6)
        }
      }
      .frame(height: 12)
    }
  }

  /// Tick (label, horizontal fraction 0...1) pairs for the current period.
  /// Fraction is the bar CENTER ((i + 0.5) / count) so labels align under the
  /// default bar chart; for the line style the end ticks differ by half a bar,
  /// which is visually negligible.
  private func axisTicks(for period: SpendPeriod) -> [(label: String, fraction: Double)] {
    func center(_ i: Int, _ n: Int) -> Double { n > 0 ? (Double(i) + 0.5) / Double(n) : 0 }
    switch period {
    case .today:
      // Hours at 0, 6, 12, 18, 23 — only those that exist.
      let hours = analytics.byHour
      guard !hours.isEmpty else { return [] }
      let n = hours.count
      return [0, 6, 12, 18, 23].compactMap { idx -> (String, Double)? in
        guard idx < n, let label = BarCardFormatting.hourShort(fromHourKey: hours[idx].hour)
        else { return nil }
        return (label, center(idx, n))
      }

    case .last7d:
      // All 7 days (or whatever suffix(7) yields): short weekday "Mon".
      let days = Array(analytics.byDay.suffix(7))
      guard !days.isEmpty else { return [] }
      let n = days.count
      return days.enumerated().compactMap { (i, d) -> (String, Double)? in
        guard let label = BarCardFormatting.weekdayShort(fromDayKey: d.date) else { return nil }
        return (label, center(i, n))
      }

    case .last30d:
      // 5 evenly-spaced "MMM d" labels: first, ~1/4, mid, ~3/4, last.
      let days = analytics.byDay
      guard days.count >= 2 else { return [] }
      let n = days.count
      let last = n - 1
      let indices = [0, last / 4, last / 2, last * 3 / 4, last].reduce(into: [Int]()) { acc, i in
        if acc.last != i { acc.append(i) }
      }
      return indices.compactMap { i -> (String, Double)? in
        guard i < n, let label = BarCardFormatting.monthDayShort(fromDayKey: days[i].date)
        else { return nil }
        return (label, center(i, n))
      }
    }
  }

  /// Honest idle caption when there's no recent spend, folding in last-active.
  private var idleCaption: String {
    let headline =
      analytics.daysSinceLastActivity.map { "No usage in \($0) days" } ?? "No usage in 30 days"
    if let lastActive { return "\(headline) · \(lastActive.lowercased())" }
    return headline
  }

  /// True when the active period's series is all zero. Still shows the chart
  /// frame + axis (do not hide them), but the bars/line toggle is suppressed.
  private var sparklineIsEmpty: Bool {
    activeSeries.allSatisfy { $0 <= 0 }
  }
}

/// One usage-surface row: surface name + proportional accent bar + cost and
/// request count. Mirrors ModelBar visually so the two sections feel cohesive.
private struct SurfaceBar: View {
  @Environment(\.barTheme) private var theme
  let surface: BarAnalyticsSurface
  let peak: Double

  var body: some View {
    GeometryReader { geo in
      let fraction = peak > 0 ? CGFloat(surface.cost / peak) : 0
      ZStack(alignment: .leading) {
        RoundedRectangle(cornerRadius: 5)
          .fill(theme.accent.opacity(0.16))
          .frame(width: max(8, geo.size.width * fraction))
        HStack {
          Text(surface.surface)
            .font(.caption)
            .lineLimit(1)
            .truncationMode(.middle)
          Spacer()
          HStack(spacing: 4) {
            Text(BarFormatting.count(surface.requests))
              .font(.system(.caption2, design: .monospaced))
              .foregroundStyle(.tertiary)
            Text(BarFormatting.money(surface.cost))
              .font(.system(.caption, design: .monospaced))
              .foregroundStyle(.secondary)
          }
        }
        .padding(.horizontal, 10)
      }
    }
    .frame(height: 26)
  }
}

/// One top-model row: name + spend with a proportional accent bar behind.
private struct ModelBar: View {
  @Environment(\.barTheme) private var theme
  let model: BarAnalytics.Model
  let peak: Double

  var body: some View {
    GeometryReader { geo in
      let fraction = peak > 0 ? CGFloat(model.cost / peak) : 0
      ZStack(alignment: .leading) {
        RoundedRectangle(cornerRadius: 5)
          .fill(theme.accent.opacity(0.16))
          .frame(width: max(8, geo.size.width * fraction))
        HStack {
          Text(model.model)
            .font(.caption)
            .lineLimit(1)
            .truncationMode(.middle)
          Spacer()
          Text(BarFormatting.money(model.cost))
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
      }
    }
    .frame(height: 26)
  }
}

/// Uppercase section divider label.
struct SectionLabel: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text.uppercased())
      .font(.system(size: 11, weight: .bold))
      .foregroundStyle(.secondary)
      .padding(.top, 1)
  }
}
