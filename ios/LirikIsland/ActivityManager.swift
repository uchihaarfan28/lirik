import ActivityKit
import Foundation
import LyricsShared
import UIKit

/// Mengelola Live Activity di iPhone dan mengirim token push-nya ke server.
@MainActor
final class ActivityManager: ObservableObject {
    static let shared = ActivityManager()

    @Published private(set) var status: ServerStatus?
    @Published private(set) var connectionError: String?
    @Published private(set) var message: String?
    @Published private(set) var activityActive = false
    @Published var displayPrefs: DisplayPreferences
    @Published var serverPrefs: ServerStatus.Preferences
    @Published var appGroupOK: Bool = false

    private var observing = false
    private var observedIDs = Set<String>()
    private var deviceTokenHex: String?

    private enum Keys {
        static let onboardingDone = "onboardingDone"
    }

    var onboardingDone: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.onboardingDone) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.onboardingDone) }
    }

    private init() {
        displayPrefs = DisplayPreferences.load()
        serverPrefs = .init(hideAfterPauseSec: 900, autoStart: true, pauseMode: "hide")
        refreshActivityFlag()
        appGroupOK = AppGroup.isAvailable
    }

    var activitiesEnabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }
    var frequentUpdatesEnabled: Bool { ActivityAuthorizationInfo().frequentPushesEnabled }

    var serverHost: String { AppConfig.hostDisplay }

    private var client: ServerClient {
        ServerClient(baseURL: AppConfig.serverURL, apiKey: AppConfig.apiKey)
    }

    // MARK: - Observasi token

    func startObserving() {
        guard !observing else { return }
        observing = true
        appGroupOK = AppGroup.isAvailable

        Task {
            for await data in Activity<LyricsActivityAttributes>.pushToStartTokenUpdates {
                await upload("api/push-to-start-token", ["token": data.hexString])
            }
        }
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

    // MARK: - Device token & artwork

    func handleDeviceToken(_ data: Data) {
        let hex = data.hexString
        deviceTokenHex = hex
        Task { await upload("api/device-token", ["token": hex]) }
    }

    func handleRemoteNotification(_ userInfo: [AnyHashable: Any]) async {
        guard let artwork = userInfo["artwork"] as? [String: Any],
              let trackId = artwork["trackId"] as? String,
              let urlString = artwork["url"] as? String,
              let url = URL(string: urlString),
              !trackId.isEmpty
        else { return }

        if ArtworkStore.hasArtwork(for: trackId) {
            await refreshLiveActivityUI()
            return
        }
        await downloadArtwork(trackId: trackId, url: url)
        await refreshLiveActivityUI()
    }

    func prefetchArtworkFromStatus() async {
        guard let np = status?.nowPlaying,
              let trackId = np.trackId, !trackId.isEmpty,
              let urlString = np.artworkURL, !urlString.isEmpty,
              let url = URL(string: urlString)
        else { return }
        if ArtworkStore.hasArtwork(for: trackId) { return }
        await downloadArtwork(trackId: trackId, url: url)
        await refreshLiveActivityUI()
    }

    private func downloadArtwork(trackId: String, url: URL) async {
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else { return }
            var rgb: (Double, Double, Double)?
            if let image = UIImage(data: data) {
                rgb = approximateDominantRGB(image)
            }
            try ArtworkStore.save(data: data, for: trackId, dominantRGB: rgb)
        } catch {
            // best-effort
        }
    }

    private func approximateDominantRGB(_ image: UIImage) -> (Double, Double, Double)? {
        guard let cg = image.cgImage else { return nil }
        let width = 8
        let height = 8
        guard let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let data = ctx.data else { return nil }
        let ptr = data.bindMemory(to: UInt8.self, capacity: width * height * 4)
        var r = 0.0, g = 0.0, b = 0.0
        let n = Double(width * height)
        for i in 0 ..< (width * height) {
            let o = i * 4
            r += Double(ptr[o]) / 255
            g += Double(ptr[o + 1]) / 255
            b += Double(ptr[o + 2]) / 255
        }
        return (r / n, g / n, b / n)
    }

    private func refreshLiveActivityUI() async {
        for activity in Activity<LyricsActivityAttributes>.activities {
            let state = activity.content.state
            await activity.update(ActivityContent(state: state, staleDate: nil))
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
            initial = .init(
                title: np.title,
                artist: np.artist,
                line: s.line,
                nextLine: s.nextLine,
                isPlaying: np.isPlaying,
                hasLyrics: s.lyrics == "synced",
                trackId: np.trackId ?? "",
                durationMs: np.durationMs ?? 0,
                playbackStartSec: 0
            )
            if let pos = np.positionMs, let dur = np.durationMs, dur > 0 {
                let start = Int(Date().timeIntervalSince1970) - (pos / 1000)
                initial.playbackStartSec = max(0, start)
                initial.durationMs = dur
            }
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
        do {
            return try await client.spotifyLoginLink()
        } catch {
            message = "Tidak bisa menghubungi server"
            return nil
        }
    }

    func testPush() async {
        do {
            try await client.post("api/test-push")
            message = "Tes push terkirim — lihat Dynamic Island / Lock Screen."
        } catch {
            message = error.localizedDescription
        }
    }

    func refreshStatus() async {
        refreshActivityFlag()
        appGroupOK = AppGroup.isAvailable
        do {
            status = try await client.status()
            connectionError = nil
            if let p = status?.preferences {
                serverPrefs = p
            }
            await prefetchArtworkFromStatus()
        } catch {
            status = nil
            connectionError = "Tidak bisa menghubungi server"
        }
    }

    func saveDisplayPrefs() {
        displayPrefs.save()
    }

    func syncServerPrefs() async {
        let body: [String: Any] = [
            "hideAfterPauseSec": serverPrefs.hideAfterPauseSec,
            "autoStart": serverPrefs.autoStart,
            "pauseMode": serverPrefs.pauseMode,
        ]
        do {
            let updated = try await client.postPreferences(body)
            serverPrefs = updated
            message = "Preferensi jeda disimpan."
        } catch {
            message = error.localizedDescription
        }
    }

    private func upload(_ path: String, _ body: [String: String]) async {
        for attempt in 0 ..< 3 {
            do {
                try await client.post(path, body)
                return
            } catch {
                if attempt == 2 { message = "Gagal kirim ke server (\(path))" }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }
}
