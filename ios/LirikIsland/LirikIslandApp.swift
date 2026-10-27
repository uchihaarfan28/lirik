import LyricsShared
import SwiftUI
import UIKit
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Task { @MainActor in ActivityManager.shared.startObserving() }
        UNUserNotificationCenter.current().requestAuthorization(options: []) { _, _ in }
        application.registerForRemoteNotifications()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in ActivityManager.shared.handleDeviceToken(deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        Task {
            await ActivityManager.shared.handleRemoteNotification(userInfo)
            completionHandler(.newData)
        }
    }
}

@main
struct LirikIslandApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var manager = ActivityManager.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(manager)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task {
                    await manager.refreshStatus()
                    await manager.ensureStartedOnOpen()
                }
            }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var manager: ActivityManager
    @State private var showOnboarding = false
    @State private var showFullLyrics = false

    var body: some View {
        ContentView()
            .onAppear {
                if !manager.onboardingDone {
                    showOnboarding = true
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .openFullLyrics)) { _ in
                showFullLyrics = true
            }
            .onOpenURL { url in
                if AppDeepLink.isLyrics(url) {
                    showFullLyrics = true
                }
            }
            .fullScreenCover(isPresented: $showOnboarding) {
                OnboardingView {
                    manager.onboardingDone = true
                    showOnboarding = false
                }
                .environmentObject(manager)
            }
            .fullScreenCover(isPresented: $showFullLyrics) {
                FullScreenLyricsView()
                    .environmentObject(manager)
            }
    }
}
