import AppKit

/// Menu-bar icon style. `color` shows the full CCS mark; `mono` uses a template
/// silhouette that macOS auto-tints black/white to match the menu bar.
enum BarIconStyle: String, CaseIterable {
  case color
  case mono
}

/// Loads the CCS icon assets bundled into the .app (Contents/Resources) and
/// hands back correctly-sized NSImages. Falls back to an SF Symbol when running
/// from `swift run` (no bundle), so the app is always usable in dev.
enum MenuBarIcon {
  static let defaultsKey = "ccsbar.iconStyle"

  static func loadStyle() -> BarIconStyle {
    let raw = UserDefaults.standard.string(forKey: defaultsKey) ?? BarIconStyle.color.rawValue
    return BarIconStyle(rawValue: raw) ?? .color
  }

  static func saveStyle(_ style: BarIconStyle) {
    UserDefaults.standard.set(style.rawValue, forKey: defaultsKey)
  }

  /// The status-bar label image at ~18pt for the given style.
  static func statusImage(_ style: BarIconStyle) -> NSImage {
    let asset = style == .mono ? "MenuBarTemplate" : "MenuBarColor"
    let image = bundleImage(asset) ?? sfSymbol("gauge.with.dots.needle.bottom.50percent")
    image.size = NSSize(width: 18, height: 18)
    image.isTemplate = (style == .mono)
    return image
  }

  /// The color CCS mark for the dropdown header at ~24pt.
  static func headerImage() -> NSImage {
    let image = bundleImage("HeaderLogo") ?? sfSymbol("gauge.with.dots.needle.bottom.50percent")
    image.size = NSSize(width: 24, height: 24)
    image.isTemplate = false
    return image
  }

  private static func bundleImage(_ name: String) -> NSImage? {
    guard
      let url = Bundle.main.url(forResource: name, withExtension: "png"),
      let image = NSImage(contentsOf: url)
    else { return nil }
    return image
  }

  private static func sfSymbol(_ name: String) -> NSImage {
    NSImage(systemSymbolName: name, accessibilityDescription: "CCS")
      ?? NSImage(systemSymbolName: "circle", accessibilityDescription: "CCS")
      ?? NSImage()
  }
}
