import AppIntents
import Foundation

/// Shortcuts / Automation: nyalakan Live Activity lirik.
struct StartLiveActivityIntent: AppIntent {
    static let title: LocalizedStringResource = "Tampilkan lirik"
    static let description = IntentDescription("Mulai Live Activity lirik di Dynamic Island, Lock Screen, dan CarPlay.")
    static let openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let manager = ActivityManager.shared
        await manager.refreshStatus()
        await manager.startActivity()
        if manager.activityActive {
            return .result(dialog: "Live Activity lirik berjalan.")
        }
        let msg = manager.message ?? "Gagal memulai Live Activity."
        return .result(dialog: IntentDialog(stringLiteral: msg))
    }
}

/// Shortcuts / Automation: hentikan Live Activity lirik.
struct StopLiveActivityIntent: AppIntent {
    static let title: LocalizedStringResource = "Hentikan lirik"
    static let description = IntentDescription("Hentikan Live Activity lirik.")
    static let openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        await ActivityManager.shared.stopActivity()
        return .result(dialog: "Live Activity dihentikan.")
    }
}

/// Buka layar penuh lirik di app.
struct OpenFullLyricsIntent: AppIntent {
    static let title: LocalizedStringResource = "Buka lirik penuh"
    static let description = IntentDescription("Buka layar penuh lirik dengan cover lagu.")
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .openFullLyrics, object: nil)
        return .result()
    }
}

extension Notification.Name {
    static let openFullLyrics = Notification.Name("LirikIsland.openFullLyrics")
}

struct LirikIslandShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartLiveActivityIntent(),
            phrases: [
                "Tampilkan lirik di \(.applicationName)",
                "Nyalakan lirik \(.applicationName)",
                "Start lyrics with \(.applicationName)",
            ],
            shortTitle: "Tampilkan lirik",
            systemImageName: "music.note.list"
        )
        AppShortcut(
            intent: StopLiveActivityIntent(),
            phrases: [
                "Hentikan lirik di \(.applicationName)",
                "Matikan lirik \(.applicationName)",
                "Stop lyrics with \(.applicationName)",
            ],
            shortTitle: "Hentikan lirik",
            systemImageName: "stop.circle"
        )
        AppShortcut(
            intent: OpenFullLyricsIntent(),
            phrases: [
                "Buka lirik penuh di \(.applicationName)",
                "Show full lyrics in \(.applicationName)",
            ],
            shortTitle: "Lirik penuh",
            systemImageName: "arrow.up.left.and.arrow.down.right"
        )
    }
}
