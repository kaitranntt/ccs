import Foundation

// MARK: - SpendChartStyle

/// User-selectable render style for the spend sparkline in the dropdown.
///
/// `.bars` (default) draws the existing RoundedRectangle bar chart.
/// `.line` draws a Path-based line graph with a faint area fill, which is
/// better for spotting trend direction across the 30-day window.
///
/// Sendable + CaseIterable so the harness can iterate all cases and the value
/// can cross actor boundaries safely.
public enum SpendChartStyle: String, CaseIterable, Sendable {
  case bars
  case line
}

// MARK: - SpendChartStyleStore

/// Persists the chosen spend-chart style. Mirrors the BarAppearanceStore pattern:
/// a UserDefaults key, a static load, and a static save. The `?? .bars` fallback
/// on a nil/unrecognized raw value is the sole source of the default.
public enum SpendChartStyleStore {
  public static let defaultsKey = "ccsbar.spendChartStyle"

  public static func load() -> SpendChartStyle {
    let raw = UserDefaults.standard.string(forKey: defaultsKey)
      ?? SpendChartStyle.bars.rawValue
    return SpendChartStyle(rawValue: raw) ?? .bars
  }

  public static func save(_ style: SpendChartStyle) {
    UserDefaults.standard.set(style.rawValue, forKey: defaultsKey)
  }
}

// MARK: - SpendPeriod

/// Time window for the spend sparkline selector: today (hourly), last 7 days,
/// or last 30 days. Mirrors the SpendChartStyle pattern: CaseIterable + Sendable.
public enum SpendPeriod: String, CaseIterable, Sendable {
  case today
  case last7d
  case last30d
}

// MARK: - SpendPeriodStore

/// Persists the chosen spend period. Mirrors SpendChartStyleStore exactly:
/// a UserDefaults key, a static load, and a static save. The `?? .last7d`
/// fallback is the sole source of the default.
public enum SpendPeriodStore {
  public static let defaultsKey = "ccsbar.spendPeriod"

  public static func load() -> SpendPeriod {
    let raw = UserDefaults.standard.string(forKey: defaultsKey)
      ?? SpendPeriod.last7d.rawValue
    return SpendPeriod(rawValue: raw) ?? .last7d
  }

  public static func save(_ period: SpendPeriod) {
    UserDefaults.standard.set(period.rawValue, forKey: defaultsKey)
  }
}
