import LyricsShared
import SwiftUI

/// Layar penuh lirik + cover — dibuka dari widget / Shortcuts / tab Sekarang.
struct FullScreenLyricsView: View {
    @EnvironmentObject private var manager: ActivityManager
    @Environment(\.dismiss) private var dismiss
    @State private var payload: LyricsPayload?
    @State private var busy = false

    var body: some View {
        ZStack {
            coverBackground
            Color.black.opacity(0.55).ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    liveActivityChip
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                Spacer(minLength: 12)

                if let np = manager.status?.nowPlaying {
                    Text("\(np.title) — \(np.artist)")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }

                lyricsScroll
                    .frame(maxHeight: .infinity)

                controls
                    .padding(.horizontal, 20)
                    .padding(.bottom, 28)
            }
        }
        .statusBarHidden(true)
        .task {
            while !Task.isCancelled {
                await reloadLyrics()
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    @ViewBuilder
    private var coverBackground: some View {
        let trackId = manager.status?.nowPlaying?.trackId
            ?? NowPlayingSnapshot.load().trackId
        Group {
            if !trackId.isEmpty, let img = ArtworkStore.loadImage(for: trackId) {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                LinearGradient(
                    colors: [
                        Color(red: 0.133, green: 0.773, blue: 0.369).opacity(0.4),
                        Color.black,
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
    }

    private var liveActivityChip: some View {
        Text(manager.activityActive ? "Live Activity aktif" : "Live Activity mati")
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(.ultraThinMaterial, in: Capsule())
            .foregroundStyle(.white)
    }

    @ViewBuilder
    private var lyricsScroll: some View {
        let lines = payload?.lines ?? []
        let index = payload?.index ?? -1
        if lines.isEmpty {
            Text(manager.status?.line ?? "Putar lagu di Spotify")
                .font(.title.bold())
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(28)
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { i, row in
                            Text(row.text)
                                .font(i == index ? .title2.bold() : .body)
                                .foregroundStyle(i == index ? Color.white : Color.white.opacity(0.45))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .id(i)
                                .scaleEffect(i == index ? 1.02 : 1)
                                .animation(.easeInOut(duration: 0.25), value: index)
                        }
                    }
                    .padding(.horizontal, 28)
                    .padding(.vertical, 24)
                }
                .onChange(of: index) { _, newValue in
                    guard newValue >= 0 else { return }
                    withAnimation(.easeInOut(duration: 0.3)) {
                        proxy.scrollTo(newValue, anchor: .center)
                    }
                }
                .onAppear {
                    if index >= 0 {
                        proxy.scrollTo(index, anchor: .center)
                    }
                }
            }
        }
    }

    private var controls: some View {
        VStack(spacing: 10) {
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
        .disabled(busy)
    }

    private func reloadLyrics() async {
        do {
            payload = try await manager.fetchLyrics()
        } catch {
            payload = nil
        }
    }

    private func run(_ action: @escaping () async -> Void) {
        Task {
            busy = true
            await action()
            busy = false
        }
    }
}
