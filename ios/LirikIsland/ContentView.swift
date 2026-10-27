import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var manager: ActivityManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            NowPlayingView()
                .tabItem { Label("Sekarang", systemImage: "music.note.list") }
            AppearanceView()
                .tabItem { Label("Tampilan", systemImage: "paintbrush") }
            StatusView()
                .tabItem { Label("Status", systemImage: "antenna.radiowaves.left.and.right") }
        }
        .tint(Color(red: 0.133, green: 0.773, blue: 0.369))
        .task(id: scenePhase) {
            manager.startObserving()
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await manager.refreshStatus()
                let playing = manager.status?.nowPlaying?.isPlaying == true
                let delay: UInt64 = playing ? 3 : 10
                try? await Task.sleep(for: .seconds(delay))
                if scenePhase != .active { break }
            }
        }
    }
}
