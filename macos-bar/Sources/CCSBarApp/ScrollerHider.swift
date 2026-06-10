import SwiftUI
import AppKit

/// Zero-size bridge that walks up to the enclosing `NSScrollView` at runtime and
/// hard-disables both scrollers.
///
/// Why this exists on top of `.scrollIndicators(.never)`: inside a
/// `MenuBarExtra` popover the SwiftUI indicator preference is sometimes ignored,
/// and AppKit still draws a vertical scroller whose track steals horizontal width
/// and shoves content out of alignment. Reaching the real `NSScrollView` and
/// setting `hasVerticalScroller = false` (plus overlay/autohide) guarantees no
/// scroller chrome regardless of how the popover hosts the SwiftUI content.
struct ScrollerHider: NSViewRepresentable {
  func makeNSView(context: Context) -> NSView {
    let probe = NSView(frame: .zero)
    // Defer the walk until the view is in the hierarchy; at make-time the
    // enclosing scroll view does not exist yet.
    DispatchQueue.main.async { hideScroller(from: probe) }
    return probe
  }

  func updateNSView(_ nsView: NSView, context: Context) {
    // The scroll view can be rebuilt on content changes inside the popover, so
    // re-apply on each update to keep the scroller suppressed.
    DispatchQueue.main.async { hideScroller(from: nsView) }
  }

  /// Walk superviews until the first `NSScrollView`, then disable its scrollers.
  private func hideScroller(from view: NSView) {
    var current: NSView? = view.superview
    while let v = current {
      if let scroll = v as? NSScrollView {
        scroll.hasVerticalScroller = false
        scroll.hasHorizontalScroller = false
        scroll.scrollerStyle = .overlay
        scroll.autohidesScrollers = true
        scroll.drawsBackground = false
        return
      }
      current = v.superview
    }
  }
}
