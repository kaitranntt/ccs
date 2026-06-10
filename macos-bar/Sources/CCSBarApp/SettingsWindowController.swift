import SwiftUI
import AppKit
import CCSBarCore

/// Opens the CCS Bar settings as a standalone AppKit `NSWindow`.
///
/// MECHANISM: a singleton `NSWindowController`-style driver backed by a real
/// `NSWindow` + `NSWindowDelegate`, NOT the SwiftUI `Window` scene. AppKit is the
/// only path that gives deterministic control of the three things a
/// MenuBarExtra-only (no dock icon) app needs:
///   (a) forcing `window.appearance` so the theme flips at the AppKit layer,
///   (b) restoring `.accessory` activation policy on close (drop the dock icon),
///   (c) singleton reuse so a second Settings click focuses the existing window
///       instead of spawning a duplicate.
/// The SwiftUI `Window` scene leaves the app stuck in `.regular` with a lingering
/// dock icon and version-dependent focus behavior, so it is deliberately avoided.
///
/// Crucially, opening this window does NOT touch the MenuBarExtra popover's own
/// NSWindow (a separate AppKit window), so the popover stays open and responsive
/// — the exact cross-window isolation `ScrollerHider` already proves works here.
/// This is what fixes BUG 1: the old `.sheet` presented inside the `.window`
/// popover stole focus and auto-dismissed the whole bar.
@MainActor
final class SettingsWindowController {
  /// One window, max. A second show() reuses it rather than spawning a duplicate.
  static let shared = SettingsWindowController()

  private var window: NSWindow?
  /// Retained so the delegate isn't deallocated while the window lives.
  private var delegate: SettingsWindowDelegate?

  private init() {}

  /// Show (or re-focus) the settings window, hosting the LIVE view model so the
  /// appearance picker drives both this window and the menu-bar popover.
  func show(viewModel: BarViewModel) {
    if let existing = window {
      // Reuse: bring the single window to front instead of opening another.
      existing.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
      return
    }

    // SwiftUI root: the SAME view model + the SAME ThemedRoot pipeline as the
    // popover, so the settings window themes identically and live-syncs.
    let root = SettingsWindowRoot(viewModel: viewModel)
    let hosting = NSHostingController(rootView: root)

    let window = NSWindow(contentViewController: hosting)
    window.title = "CCS Bar Settings"
    // Titled + closable only: it's a settings dialog, not a document window, so
    // no miniaturize/zoom. Resizable (no .nonResizable) per the spec.
    window.styleMask = [.titled, .closable, .resizable]
    window.setContentSize(NSSize(width: 460, height: 600))
    window.minSize = NSSize(width: 420, height: 520)
    // Reuse the instance on reopen instead of tearing it down on close.
    window.isReleasedWhenClosed = false
    window.center()

    let delegate = SettingsWindowDelegate(onClose: { [weak self] in self?.handleClose() })
    window.delegate = delegate
    self.delegate = delegate
    self.window = window

    // Accessory (menu-bar-only) apps can't take key focus; upgrade to .regular
    // so the window focuses and shows in the app switcher while it's open.
    NSApp.setActivationPolicy(.regular)
    window.makeKeyAndOrderFront(nil)
    // Force front even when invoked from another frontmost app.
    NSApp.activate(ignoringOtherApps: true)
  }

  /// Close the window programmatically (e.g. the Done button). Routes through
  /// `performClose` so the delegate restores `.accessory` mode exactly like the
  /// title-bar close button — `@Environment(\.dismiss)` is a no-op in a plain
  /// NSHostingController window, so this is the reliable path.
  func close() { window?.performClose(nil) }

  /// Delegate callback on window close: drop the dock icon back so we return to
  /// menu-bar-only mode. The popover is untouched throughout. The window itself
  /// is kept (isReleasedWhenClosed = false) for cheap reuse, but we clear our
  /// reference so the next show() rebuilds a fresh, correctly-centered window.
  private func handleClose() {
    NSApp.setActivationPolicy(.accessory)
    window = nil
    delegate = nil
  }
}

/// Bridges `NSWindow` close back to the controller so it can restore the
/// `.accessory` activation policy (menu-bar-only mode).
final class SettingsWindowDelegate: NSObject, NSWindowDelegate {
  private let onClose: () -> Void
  init(onClose: @escaping () -> Void) {
    self.onClose = onClose
  }
  func windowWillClose(_ notification: Notification) {
    onClose()
  }
}

/// SwiftUI root hosted inside the settings `NSWindow`. Wraps the reused
/// `BarPreferencesView` in the SAME `ThemedRoot` token pipeline as the popover,
/// so the settings window themes identically. Observing the shared
/// `BarViewModel` means a theme pick here re-renders BOTH windows live.
struct SettingsWindowRoot: View {
  @ObservedObject var viewModel: BarViewModel
  /// The prefs adapter the view edits; shares the standard suite with the view
  /// model so a write-through is visible on the next poll (same as the popover).
  private let prefs = BarPreferences()

  var body: some View {
    // ThemedRoot applies .preferredColorScheme + injects tokens, and its
    // .background WindowAppearanceForcer forces THIS NSWindow's appearance so
    // system materials + semantic colors flip too — single source of truth with
    // the popover. Fill the window so the plate covers the full content area.
    ThemedRoot(appearance: viewModel.appearance) {
      BarPreferencesView(viewModel: viewModel, prefs: prefs)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}
