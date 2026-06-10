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
