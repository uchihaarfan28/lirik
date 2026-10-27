import ActivityKit
import Foundation

/// Mengelola Live Activity di iPhone dan mengirim token push-nya ke server.
@MainActor
final class ActivityManager: ObservableObject {
    static let shared = ActivityManager()

    @Published var serverURL: String {
        didSet { UserDefaults.standard.set(serverURL, forKey: Keys.server) }
    }
    @Published var apiKey: String {
        didSet { UserDefaults.standard.set(apiKey, forKey: Keys.apiKey) }
    }

    @Published private(set) var status: ServerStatus?
    @Published private(set) var connectionError: String?
    @Published private(set) var message: String?
    @Published private(set) var activityActive = false

    private var observing = false
    private var observedIDs = Set<String>()

    private enum Keys {
        static let server = "serverURL"
        static let apiKey = "apiKey"
    }

    private init() {
        serverURL = UserDefaults.standard.string(forKey: Keys.server) ?? ""
        apiKey = UserDefaults.standard.string(forKey: Keys.apiKey) ?? ""
        refreshActivityFlag()
    }

    var activitiesEnabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }
    var frequentUpdatesEnabled: Bool { ActivityAuthorizationInfo().frequentPushesEnabled }

    private var client: ServerClient? {
        let trimmed = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme?.hasPrefix("http") == true, !apiKey.isEmpty else {
            return nil
        }
        return ServerClient(baseURL: url, apiKey: apiKey.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    // MARK: - Observasi token

    func startObserving() {
        guard !observing else { return }
        observing = true

        // Token "push-to-start": server bisa memulai Live Activity sendiri saat Spotify mulai diputar.
        Task {
            for await data in Activity<LyricsActivityAttributes>.pushToStartTokenUpdates {
                await upload("api/push-to-start-token", ["token": data.hexString])
            }
        }
        // Live Activity baru (termasuk yang dimulai server lewat push-to-start).
        Task {
            for await activity in Activity<LyricsActivityAttributes>.activityUpdates {
                observe(activity)
            }
        }
        for activity in Activity<LyricsActivityAttributes>.activities {
            observe(activity)
        }
    }

    private func observe(_ activity: Activity<LyricsActivityAttributes>) {
        let id = activity.id
        guard !observedIDs.contains(id) else { return }
        observedIDs.insert(id)
        refreshActivityFlag()

        // Token update khusus activity ini → server memakainya untuk kirim baris lirik.
        Task {
            for await data in activity.pushTokenUpdates {
                await upload("api/activity-token", ["token": data.hexString, "activityId": id])
            }
        }
        Task {
            for await state in activity.activityStateUpdates {
                if state == .ended || state == .dismissed {
                    observedIDs.remove(id)
                    refreshActivityFlag()
                    await upload("api/activity-ended", ["activityId": id])
                    break
                }
            }
        }
    }

    private func refreshActivityFlag() {
        activityActive = Activity<LyricsActivityAttributes>.activities.contains {
            $0.activityState == .active || $0.activityState == .stale
        }
    }

    // MARK: - Aksi dari UI

    func startActivity() async {
        guard activitiesEnabled else {
            message = "Live Activities mati. Nyalakan di Settings › Lirik Island › Live Activities."
            return
        }
        for existing in Activity<LyricsActivityAttributes>.activities {
            await existing.end(nil, dismissalPolicy: .immediate)
        }
        var initial = LyricsActivityAttributes.ContentState.waiting
        if let s = status, let np = s.nowPlaying {
            initial = .init(title: np.title, artist: np.artist, line: s.line, nextLine: s.nextLine,
                            isPlaying: np.isPlaying, hasLyrics: s.lyrics == "synced")
        }
        do {
            let activity = try Activity<LyricsActivityAttributes>.request(
                attributes: LyricsActivityAttributes(appName: LyricsActivityAttributes.appDisplayName),
                content: ActivityContent(state: initial, staleDate: nil),
                pushType: .token
            )
            observe(activity)
            message = "Live Activity berjalan. Kunci layar atau sambungkan CarPlay."
        } catch {
            message = "Gagal memulai Live Activity: \(error.localizedDescription)"
        }
    }

    func stopActivity() async {
        for activity in Activity<LyricsActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        refreshActivityFlag()
        message = "Live Activity dihentikan."
    }

    func spotifyLoginURL() async -> URL? {
        guard let client else {
            message = "Isi URL server dan API key dulu."
            return nil
        }
        do {
            return try await client.spotifyLoginLink()
        } catch {
            message = "Tidak bisa membuat link login: \(error.localizedDescription)"
            return nil
        }
    }

    func testPush() async {
        guard let client else { message = "Isi URL server dan API key dulu."; return }
        do {
            try await client.post("api/test-push")
            message = "Tes push terkirim — lihat Dynamic Island / Lock Screen."
        } catch {
            message = error.localizedDescription
        }
    }

    func refreshStatus() async {
        refreshActivityFlag()
        guard let client else {
            status = nil
            connectionError = "Belum diatur"
            return
        }
        do {
            status = try await client.status()
            connectionError = nil
        } catch {
            status = nil
            connectionError = error.localizedDescription
        }
    }

    private func upload(_ path: String, _ body: [String: String]) async {
        guard let client else { return }
        // Coba beberapa kali — app bisa saja baru dibangunkan di background dengan jaringan lambat.
        for attempt in 0 ..< 3 {
            do {
                try await client.post(path, body)
                return
            } catch {
                if attempt == 2 { message = "Gagal kirim ke server (\(path)): \(error.localizedDescription)" }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }
}
