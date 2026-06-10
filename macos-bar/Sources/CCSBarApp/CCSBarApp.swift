import SwiftUI
import CCSBarCore

/// CCS Bar entry point. A menu-bar-only app (no dock icon) whose title shows
/// the leading account's quota and today's total cost, with a dropdown for
/// per-account detail and control.
@main
struct CCSBarApp: App {
  @StateObject private var viewModel = BarViewModel()

  init() {
    // Seed the registration domain BEFORE any pref read so absent Bool keys
    // resolve to their real defaults (true) instead of reading back as false,
    // which would silently disable every alert on a fresh install.
    BarPreferences().registerDefaults()
  }

  var body: some Scene {
    MenuBarExtra {
      // ThemedRoot forces the chosen scheme and injects the resolved tokens, so
      // the whole dropdown follows the user's appearance pick independently of
      // the macOS system appearance. The label (status item) stays OS-tinted.
      ThemedRoot(appearance: viewModel.appearance) {
        BarMenuView(viewModel: viewModel)
      }
    } label: {
      // The CCS mark + compact glance. The image re-renders when the style
      // preference changes because `iconStyle` is observed.
      Image(nsImage: MenuBarIcon.statusImage(viewModel.iconStyle))
      Text(viewModel.statusTitle)
    }
    .menuBarExtraStyle(.window)
  }
}

/// Forces the chosen color scheme on the dropdown content at the boundary, then
/// hands off to `ResolvedThemeHost` to read the now-forced scheme and inject
/// tokens. The split is deliberate: `.preferredColorScheme` rewrites the
/// environment for DESCENDANTS only, so a view cannot read its own forced scheme
/// in the same scope. `ResolvedThemeHost` is a descendant and therefore sees it.
struct ThemedRoot<Content: View>: View {
  let appearance: BarAppearance
  @ViewBuilder var content: Content

  var body: some View {
    // Order matters: .preferredColorScheme first updates the SwiftUI \.colorScheme
    // environment for descendants (so the token resolver + Color.primary/.secondary
    // pick up the chosen scheme), THEN the .background WindowAppearanceForcer sets
    // the actual host NSWindow.appearance so system materials + semantic-color
    // inversions flip at the AppKit layer too — not just the custom RGB tokens.
    // The two are complementary: env tokens + real window appearance. KEEP both.
    ResolvedThemeHost(content: content)
      .preferredColorScheme(appearance.forced)
      .background(WindowAppearanceForcer(appearance: appearance))
  }
}

/// Reads the (already-forced) color scheme, resolves the matching `BarTheme`,
/// paints the themed window plate behind the content, and injects the tokens.
/// In dark the plate is `.clear` (native MenuBarExtra material shows through —
/// zero regression); in light it is the explicit #F5F5F7 plate so the dropdown
/// renders light even when macOS is in dark mode.
struct ResolvedThemeHost<Content: View>: View {
  @Environment(\.colorScheme) private var colorScheme
  let content: Content

  var body: some View {
    let theme = BarTheme.resolve(colorScheme)
    content
      .background(theme.windowSurface)
      .environment(\.barTheme, theme)
  }
}
