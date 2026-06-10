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

  /// The collapsed informational spend strip: a "SPEND" label, one muted caption
  /// line, and a thin inline 30-day sparkline when there is real spend.
  private var spendStrip: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 6) {
        SectionLabel("Spend")
        Spacer()
        // Inline bars/line toggle in the header's blank space — no Settings trip.
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
        if !sparklineIsEmpty {
          // height: 30 (up from 18) so daily spend gradations are clearly readable.
          Sparkline(values: analytics.byDay.map(\.cost), accent: theme.accent,
                    style: spendChartStyle)
            .frame(height: 30)
        }
      } else {
        Text(idleCaption)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }

  /// One-line rollup: "today $NN · 7d $N.Nk · 30d $N.Nk".
  private var spendCaption: String {
    "today \(BarFormatting.money(analytics.today.cost))"
      + " · 7d \(BarFormatting.money(analytics.last7d.cost))"
      + " · 30d \(BarFormatting.money(analytics.last30d.cost))"
  }

  /// Honest idle caption when there's no recent spend, folding in last-active.
  private var idleCaption: String {
    let headline =
      analytics.daysSinceLastActivity.map { "No usage in \($0) days" } ?? "No usage in 30 days"
    if let lastActive { return "\(headline) · \(lastActive.lowercased())" }
    return headline
  }

  private var sparklineIsEmpty: Bool {
    analytics.byDay.allSatisfy { $0.cost <= 0 }
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
