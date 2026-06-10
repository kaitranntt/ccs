import SwiftUI
import AppKit
import CCSBarCore

/// Zero-size bridge that walks up to the host `NSWindow` and forces its
/// `appearance` to match the user's chosen `BarAppearance`.
///
/// Why this exists on top of `.preferredColorScheme`: that modifier only
/// rewrites the SwiftUI `\.colorScheme` environment for descendant views — it
/// does NOT change the host `NSWindow.effectiveAppearance`. So AppKit-level
/// surfaces keep reading the OS appearance and fight the chosen theme:
///   - system materials (the MenuBarExtra popover's backing material)
///   - semantic colors (`Color.primary` / `.secondary`, used by Chip text,
///     health dots, captions) which invert off the window appearance.
/// Setting `window.appearance` directly fixes the theme at the AppKit layer so
/// the whole surface flips, not just the custom RGB tokens.
///
/// Modeled on the proven `ScrollerHider` pattern (which already reaches the host
/// window inside this popover), proving cross-window AppKit access works here.
struct WindowAppearanceForcer: NSViewRepresentable {
  let appearance: BarAppearance

  func makeNSView(context: Context) -> NSView {
    let probe = NSView(frame: .zero)
    // Defer until the view is in the hierarchy; at make-time `view.window` is nil.
    DispatchQueue.main.async { apply(to: probe) }
    return probe
  }

  func updateNSView(_ nsView: NSView, context: Context) {
    // Re-apply on every update: the popover's NSWindow can be rebuilt on content
    // changes, and the appearance pick itself changes mid-session.
    DispatchQueue.main.async { apply(to: nsView) }
  }

  /// Force the host window's appearance from the chosen theme.
  ///   .system -> nil   (follow the OS)
  ///   .light  -> aqua
  ///   .dark   -> darkAqua
  private func apply(to view: NSView) {
    guard let window = view.window else { return }
    switch appearance {
    case .system:
      window.appearance = nil
    case .light:
      window.appearance = NSAppearance(named: .aqua)
    case .dark:
      window.appearance = NSAppearance(named: .darkAqua)
    }
  }
}
