import SwiftUI
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Dijalankan juga saat iOS membangunkan app di background (mis. setelah push-to-start),
        // supaya token update Live Activity tetap terkirim ke server.
        Task { @MainActor in ActivityManager.shared.startObserving() }
        return true
    }
}

@main
struct LirikIslandApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var manager = ActivityManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(manager)
        }
    }
}
