import Foundation
import UserNotifications
import CCSBarCore

/// Real notification delivery backed by `UNUserNotificationCenter`.
///
/// Authorization is requested LAZILY on the first non-empty deliver, not at
/// launch. Ad-hoc-signed menu-bar apps launched via `open` get a flaky / silently
/// dropped prompt when authorization is requested during startup, so we defer the
/// request until there is actually something to show — the prompt then lands with
/// user-visible context.
///
/// When authorization is denied, `deliver` is a no-op, but the rule engine keeps
/// updating its fired-keys regardless (the App persists them independent of
/// delivery). That avoids a backlog of stale alerts replaying if the user later
/// grants permission — only conditions still true at that later poll re-fire.
@MainActor
final class BarNotifier: NotificationDelivering {
  enum AuthState {
    case unknown
    case authorized
    case denied
  }

  private let center: UNUserNotificationCenter?
  private var authState: AuthState = .unknown
  private var didRequest = false

  /// `UNUserNotificationCenter.current()` traps when there is no main bundle
  /// identifier (e.g. a bare `swift run` with no .app wrapper). Guard it so the
  /// wiring still compiles and runs headlessly; delivery is simply a no-op there.
  init() {
    if Bundle.main.bundleIdentifier != nil {
      center = UNUserNotificationCenter.current()
    } else {
      center = nil
    }
  }

  /// Deliver one notification. The first call with a notification triggers a
  /// one-time authorization request; subsequent calls reuse the cached state.
  nonisolated func deliver(_ notification: BarNotification) {
    Task { @MainActor in
      self.send(notification)
    }
  }

  private func send(_ notification: BarNotification) {
    guard let center else { return }

    if !didRequest {
      didRequest = true
      // Request once, lazily. The completion updates cached state; this in-flight
      // notification is enqueued after, so an accepted prompt still shows it.
      center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
        // Hop back to the main actor and re-read `self.center` there rather than
        // capturing the non-Sendable center across the closure boundary.
        Task { @MainActor in
          guard let self else { return }
          self.authState = granted ? .authorized : .denied
          if granted, let c = self.center { self.post(notification, on: c) }
        }
      }
      return
    }

    // Already requested: post when authorized or still-unknown; a denied state is a no-op.
    if authState == .authorized || authState == .unknown {
      post(notification, on: center)
    }
  }

  private func post(_ notification: BarNotification, on center: UNUserNotificationCenter) {
    let content = UNMutableNotificationContent()
    content.title = notification.title
    content.body = notification.body
    content.sound = .default
    // Identifier == fired-key so the OS de-dupes at the delivery layer too: a
    // re-posted same-key request replaces rather than stacks.
    let request = UNNotificationRequest(
      identifier: notification.id, content: content, trigger: nil)
    center.add(request, withCompletionHandler: nil)
  }
}
