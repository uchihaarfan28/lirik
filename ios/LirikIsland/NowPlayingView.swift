import LyricsShared
import SwiftUI

struct NowPlayingView: View {
    @EnvironmentObject private var manager: ActivityManager
    @State private var busy = false
    @State private var showFullLyrics = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    artworkHero
                        .onTapGesture { showFullLyrics = true }
                    lyricsBlock
                        .onTapGesture { showFullLyrics = true }
                    controls
                    Button {
                        showFullLyrics = true
                    } label: {
                        Label("Layar penuh", systemImage: "arrow.up.left.and.arrow.down.right")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    if let msg = manager.message {
                        Text(msg)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(20)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Sekarang")
            .toolbarBackground(.visible, for: .navigationBar)
            .disabled(busy)
            .fullScreenCover(isPresented: $showFullLyrics) {
                FullScreenLyricsView()
                    .environmentObject(manager)
            }
        }
    }

    @ViewBuilder
    private var artworkHero: some View {
        let trackId = manager.status?.nowPlaying?.trackId ?? ""
        Group {
            if !trackId.isEmpty, let img = ArtworkStore.loadImage(for: trackId) {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(1, contentMode: .fill)
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                    Image(systemName: "music.note")
                        .font(.system(size: 48))
                        .foregroundStyle(Color(red: 0.133, green: 0.773, blue: 0.369))
                }
            }
        }
        .frame(maxWidth: 260)
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.4), radius: 20, y: 8)
    }

    private var lyricsBlock: some View {
        VStack(spacing: 8) {
            if let np = manager.status?.nowPlaying {
                Text("\(np.title) — \(np.artist)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Text(manager.status?.line ?? "")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                if let next = manager.status?.nextLine, !next.isEmpty {
                    Text(next)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            } else {
                Text("Putar lagu di Spotify")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var controls: some View {
        VStack(spacing: 12) {
            if manager.activityActive {
                Button(role: .destructive) {
                    run { await manager.stopActivity() }
                } label: {
                    Text("Hentikan Live Activity")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            } else {
                Button {
                    run { await manager.startActivity() }
                } label: {
                    Text("Tampilkan lirik")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.133, green: 0.773, blue: 0.369))
            }
        }
    }

    private func run(_ action: @escaping () async -> Void) {
        Task {
            busy = true
            await action()
            busy = false
            await manager.refreshStatus()
        }
    }
}
