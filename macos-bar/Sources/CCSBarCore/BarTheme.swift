import SwiftUI

// Theme token model for the menu-bar dropdown.
//
// Lives in CCSBarCore (not the SwiftUI app target) so the assert harness can
// import and verify the palette/enum/resolver without a full Xcode/XCTest
// toolchain. This is the ONE file in CCSBarCore that imports SwiftUI — every
// other Core file stays Foundation-only. SwiftUI's ColorScheme/Color compile
// and run on the CommandLineTools toolchain, which is why this is safe here.

// MARK: - Raw palette (harness-assertable)

/// A plain RGB triple. We keep raw Doubles (not SwiftUI `Color`) as the source
/// of truth because `Color` equality is unreliable for tests — two Colors built
/// from identical components are not guaranteed `==`. Asserting on these Doubles
/// is exact, so the dark-regression lock and light-value lock are byte-precise.
public struct RGB: Equatable, Sendable {
  public let r: Double
  public let g: Double
  public let b: Double
  public init(_ r: Double, _ g: Double, _ b: Double) {
    self.r = r
    self.g = g
    self.b = b
  }
}

/// Named color triples for one appearance. Pure data so it round-trips through
/// the harness with exact equality.
public struct BarPalette: Equatable, Sendable {
  public let accentRGB: RGB
  public let subscriptionRGB: RGB
  public let bandGreenRGB: RGB
  public let bandAmberRGB: RGB
  public let bandCoralRGB: RGB
  public let bandRedRGB: RGB
  /// Light-mode window plate. In dark mode the window defers to the native
  /// MenuBarExtra material, so this value is unused there (windowSurface == .clear).
  public let windowSurfaceRGB: RGB

  public init(
    accentRGB: RGB, subscriptionRGB: RGB, bandGreenRGB: RGB, bandAmberRGB: RGB,
    bandCoralRGB: RGB, bandRedRGB: RGB, windowSurfaceRGB: RGB
  ) {
    self.accentRGB = accentRGB
    self.subscriptionRGB = subscriptionRGB
    self.bandGreenRGB = bandGreenRGB
    self.bandAmberRGB = bandAmberRGB
    self.bandCoralRGB = bandCoralRGB
    self.bandRedRGB = bandRedRGB
    self.windowSurfaceRGB = windowSurfaceRGB
  }

  /// DARK = today's exact values, lifted verbatim from the original Sparkline
  /// `BarTheme` enum. These are LOCKED: any drift fails the harness, guaranteeing
  /// byte-identical rendering on upgrade for users who stay on the default theme.
  public static let dark = BarPalette(
    accentRGB: RGB(0.886, 0.451, 0.137),        // #E2732A CCS orange
    subscriptionRGB: RGB(0.357, 0.388, 0.851),  // #5B63D9 indigo
    bandGreenRGB: RGB(0.36, 0.74, 0.56),        // #5CBC8F emerald
    bandAmberRGB: RGB(0.86, 0.67, 0.31),        // #DBAB4F gold
    bandCoralRGB: RGB(0.91, 0.46, 0.36),        // #E8755C warning
    bandRedRGB: RGB(0.85, 0.34, 0.31),          // #D9564F critical
    windowSurfaceRGB: RGB(0, 0, 0)              // unused in dark (windowSurface == .clear)
  )

  /// LIGHT = deepened/saturated variants tuned for legibility on a ~#F5F5F7
  /// white plate. The dark-tuned muted values read too pale on white, so each
  /// themed token is darkened with more saturation while preserving the
  /// green→amber→coral→red ramp ordering.
  public static let light = BarPalette(
    accentRGB: RGB(0.812, 0.357, 0.063),        // #CF5B10 deeper orange
    subscriptionRGB: RGB(0.275, 0.302, 0.745),  // #464DBE darker indigo
    bandGreenRGB: RGB(0.106, 0.580, 0.357),     // #1B945B emerald
    bandAmberRGB: RGB(0.722, 0.490, 0.043),     // #B87D0B ochre
    bandCoralRGB: RGB(0.831, 0.302, 0.157),     // #D44D28 coral
    bandRedRGB: RGB(0.776, 0.157, 0.137),       // #C62823 critical red
    windowSurfaceRGB: RGB(0.961, 0.961, 0.969)  // #F5F5F7 light plate
  )
}

// MARK: - Appearance enum + forced-scheme mapping

/// User-selectable menu-bar theme. `.system` follows the real OS appearance;
/// `.light`/`.dark` force a scheme regardless of OS.
public enum BarAppearance: String, CaseIterable, Sendable {
  case system
  case light
  case dark

  /// The scheme to force on the dropdown. `nil` => inherit the real OS
  /// appearance; `.light`/`.dark` => override it.
  public var forced: ColorScheme? {
    switch self {
    case .system: return nil
    case .light: return .light
    case .dark: return .dark
    }
  }
}

// MARK: - Resolved token struct (views read this)

/// The resolved SwiftUI tokens consumed by the dropdown views. Built from a
/// `BarPalette`, plus two derived `Color.primary.opacity(...)` surfaces that
/// auto-invert with the forced scheme (primary is black on light, white on
/// dark) and so are identical in both presets.
public struct BarTheme: Sendable {
  /// The palette this theme resolved from — kept so the harness can verify the
  /// resolver picked the right set without relying on Color equality.
  public let palette: BarPalette

  public let accent: Color
  public let subscription: Color
  public let bandGreen: Color
  public let bandAmber: Color
  public let bandCoral: Color
  public let bandRed: Color
  /// Faint elevated surface; derived, auto-inverts. Centralizes the inline
  /// `Color.primary.opacity(0.05)` references.
  public let cardSurface: Color
  /// Quota-bar track; derived, auto-inverts. Centralizes `Color.primary.opacity(0.12)`.
  public let barTrack: Color
  /// Window plate. Dark = `.clear` (defer to native material, zero regression);
  /// light = explicit #F5F5F7 so tokens never render on a leftover dark material.
  public let windowSurface: Color

  public init(palette: BarPalette) {
    self.palette = palette
    self.accent = Color(rgb: palette.accentRGB)
    self.subscription = Color(rgb: palette.subscriptionRGB)
    self.bandGreen = Color(rgb: palette.bandGreenRGB)
    self.bandAmber = Color(rgb: palette.bandAmberRGB)
    self.bandCoral = Color(rgb: palette.bandCoralRGB)
    self.bandRed = Color(rgb: palette.bandRedRGB)
    self.cardSurface = Color.primary.opacity(0.05)
    self.barTrack = Color.primary.opacity(0.12)
    // Dark defers to the native MenuBarExtra material; only light owns a plate.
    self.windowSurface = (palette == .dark) ? .clear : Color(rgb: palette.windowSurfaceRGB)
  }

  public static let dark = BarTheme(palette: .dark)
  public static let light = BarTheme(palette: .light)

  /// Pure resolver: returns the token set for a given (already-forced) scheme.
  /// The root view applies `.preferredColorScheme(appearance.forced)` and then
  /// reads `\.colorScheme` on a descendant, so the scheme passed here always
  /// reflects exactly what the user sees (for `.system`, the real OS scheme).
  public static func resolve(_ scheme: ColorScheme) -> BarTheme {
    scheme == .dark ? .dark : .light
  }
}

extension Color {
  /// Builds a Color from a raw RGB triple.
  fileprivate init(rgb: RGB) {
    self.init(red: rgb.r, green: rgb.g, blue: rgb.b)
  }
}

// MARK: - Environment propagation

/// Injects the resolved theme down the view tree. The default is the tuned
/// dark preset so any view rendered outside an injected subtree (SwiftUI
/// previews, a stray child) gets the exact current look — no crash, no
/// regression.
public struct BarThemeKey: EnvironmentKey {
  public static let defaultValue = BarTheme.dark
}

extension EnvironmentValues {
  public var barTheme: BarTheme {
    get { self[BarThemeKey.self] }
    set { self[BarThemeKey.self] = newValue }
  }
}

// MARK: - Persistence

/// Persists the chosen appearance. Structurally mirrors `MenuBarIcon` load/save.
/// Appearance is global chrome (not an alert pref), so it is NOT registered in
/// `registerDefaults()`; the `?? .dark` fallback on a nil string read is the
/// source of the default, avoiding any registration-domain trap.
public enum BarAppearanceStore {
  public static let defaultsKey = "ccsbar.appearance"

  public static func load() -> BarAppearance {
    let raw =
      UserDefaults.standard.string(forKey: defaultsKey) ?? BarAppearance.dark.rawValue
    return BarAppearance(rawValue: raw) ?? .dark
  }

  public static func save(_ appearance: BarAppearance) {
    UserDefaults.standard.set(appearance.rawValue, forKey: defaultsKey)
  }
}
