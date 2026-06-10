import SwiftUI
import CCSBarCore

/// A compact sparkline for daily values (e.g. cost per day over 30 days).
///
/// Two render styles controlled by `style`:
///  - `.bars` (default): the original RoundedRectangle bar chart. Zero-value days
///    render as faint placeholders so the cadence stays readable.
///  - `.line`: a Path-based polyline through the normalized points, stroked ~1.5pt,
///    with a subtle area fill (accent at ~0.15 opacity) under the curve. Better for
///    reading trend direction over a long window. Falls back to a flat baseline when
///    count < 2 or all values are zero.
struct Sparkline: View {
  let values: [Double]
  // Default is the dark preset's accent: a default argument can't read the
  // environment, so this is the static fallback. Live callers pass the themed
  // `theme.accent` from the parent so the rendered bar follows the chosen theme.
  var accent: Color = BarTheme.dark.accent
  /// Render mode. Default `.bars` preserves the original look; `.line` draws a
  /// trend line instead.
  var style: SpendChartStyle = .bars

  var body: some View {
    GeometryReader { geo in
      switch style {
      case .bars:
        barsBody(in: geo.size)
      case .line:
        lineBody(in: geo.size)
      }
    }
  }

  // MARK: Bar render (original)

  private func barsBody(in size: CGSize) -> some View {
    let peak = max(values.max() ?? 0, 0.0001)
    return HStack(alignment: .bottom, spacing: 3) {
      ForEach(Array(values.enumerated()), id: \.offset) { _, value in
        let height = CGFloat(value / peak) * size.height
        RoundedRectangle(cornerRadius: 2)
          .fill(value > 0 ? accent : Color.secondary.opacity(0.2))
          .frame(height: max(2, height))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
  }

  // MARK: Line render

  /// Polyline path connecting the normalized data points. x is evenly spaced
  /// across the width; y is inverted so a larger value is higher (closer to 0).
  @ViewBuilder private func lineBody(in size: CGSize) -> some View {
    let peak = max(values.max() ?? 0, 0.0001)
    let count = values.count
    let allZero = values.allSatisfy { $0 <= 0 }

    if count < 2 || allZero {
      // Flat baseline — nothing to show; render a faint hairline so the area
      // is not invisible on an idle spend strip.
      Path { p in
        p.move(to: CGPoint(x: 0, y: size.height))
        p.addLine(to: CGPoint(x: size.width, y: size.height))
      }
      .stroke(accent.opacity(0.2), lineWidth: 1)
    } else {
      // Build points: x evenly spaced, y inverted (0 = top = max value).
      let pts: [CGPoint] = values.enumerated().map { i, v in
        let x = CGFloat(i) / CGFloat(count - 1) * size.width
        let y = size.height - CGFloat(v / peak) * size.height
        return CGPoint(x: x, y: y)
      }

      // Area fill: close the path by dropping to the bottom edge.
      let fillPath = Path { p in
        p.move(to: CGPoint(x: pts[0].x, y: size.height))
        p.addLine(to: pts[0])
        for pt in pts.dropFirst() { p.addLine(to: pt) }
        p.addLine(to: CGPoint(x: pts[pts.count - 1].x, y: size.height))
        p.closeSubpath()
      }

      // Stroke path.
      let strokePath = Path { p in
        p.move(to: pts[0])
        for pt in pts.dropFirst() { p.addLine(to: pt) }
      }

      ZStack {
        fillPath.fill(accent.opacity(0.15))
        strokePath.stroke(accent, lineWidth: 1.5)
      }
    }
  }
}
