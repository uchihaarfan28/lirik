import LyricsShared
import SwiftUI

struct AppearanceView: View {
    @EnvironmentObject private var manager: ActivityManager
    @State private var saving = false

    private let demo = LyricsActivityAttributes.ContentState(
        title: "Lagu Demo",
        artist: "Pulau Kecil",
        line: "Lampu kota berbaris di kaca depan",
        nextLine: "Jalan tol sepi, radio pelan",
        isPlaying: true,
        hasLyrics: true,
        trackId: "",
        durationMs: 180_000,
        playbackStartSec: Int(Date().timeIntervalSince1970) - 45
    )

    var body: some View {
        NavigationStack {
            Form {
                Section("Pratinjau Lock Screen") {
                    Group {
                        switch manager.displayPrefs.lockScreenStyle {
                        case .classic:
                            LockScreenClassicView(state: demo, prefs: manager.displayPrefs, isStale: false)
                        case .cover:
                            LockScreenCoverView(state: demo, prefs: manager.displayPrefs, isStale: false)
                        case .minimal:
                            LockScreenMinimalView(state: demo, isStale: false)
                        }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.black)
                }

                Section("Gaya Lock Screen") {
                    Picker("Gaya", selection: $manager.displayPrefs.lockScreenStyle) {
                        Text("Klasik").tag(DisplayPreferences.LockScreenStyle.classic)
                        Text("Cover").tag(DisplayPreferences.LockScreenStyle.cover)
                        Text("Minimal").tag(DisplayPreferences.LockScreenStyle.minimal)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: manager.displayPrefs.lockScreenStyle) { _, _ in manager.saveDisplayPrefs() }
                }

                Section("Dynamic Island") {
                    Picker("Compact", selection: $manager.displayPrefs.islandCompact) {
                        Text("Lirik").tag(DisplayPreferences.IslandCompact.lyric)
                        Text("Ikon").tag(DisplayPreferences.IslandCompact.icon)
                    }
                    .onChange(of: manager.displayPrefs.islandCompact) { _, _ in manager.saveDisplayPrefs() }

                    Toggle("Tampilkan baris berikutnya", isOn: $manager.displayPrefs.showNextLine)
                        .onChange(of: manager.displayPrefs.showNextLine) { _, _ in manager.saveDisplayPrefs() }
                    Toggle("Progress lagu", isOn: $manager.displayPrefs.showProgress)
                        .onChange(of: manager.displayPrefs.showProgress) { _, _ in manager.saveDisplayPrefs() }
                }

                Section {
                    Picker("Gaya", selection: $manager.displayPrefs.widgetStyle) {
                        Text("Cover").tag(DisplayPreferences.WidgetStyle.cover)
                        Text("Lirik").tag(DisplayPreferences.WidgetStyle.lyric)
                        Text("Minimal").tag(DisplayPreferences.WidgetStyle.minimal)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: manager.displayPrefs.widgetStyle) { _, _ in manager.saveDisplayPrefs() }
                } header: {
                    Text("Widget Home Screen / CarPlay")
                } footer: {
                    Text("Tambah widget dari layar utama (tahan → Edit Home Screen). Di CarPlay (iOS 26) pilih ukuran kecil. Ketuk widget membuka lirik penuh.")
                }

                Section {
                    Toggle("Mulai Live Activity saat app dibuka", isOn: $manager.displayPrefs.startOnOpen)
                        .onChange(of: manager.displayPrefs.startOnOpen) { _, _ in manager.saveDisplayPrefs() }
                } header: {
                    Text("Live Activity")
                } footer: {
                    Text("Juga bisa lewat Shortcuts: \"Tampilkan lirik\" / \"Hentikan lirik\" untuk Automation.")
                }

                Section("Aksen") {
                    Picker("Warna", selection: $manager.displayPrefs.accent) {
                        Text("Hijau Spotify").tag(DisplayPreferences.Accent.hijauSpotify)
                        Text("Dari cover").tag(DisplayPreferences.Accent.warnaCover)
                        Text("Putih").tag(DisplayPreferences.Accent.putih)
                    }
                    .onChange(of: manager.displayPrefs.accent) { _, _ in manager.saveDisplayPrefs() }
                }

                Section {
                    Toggle("Mulai otomatis saat Spotify diputar", isOn: $manager.serverPrefs.autoStart)
                    Toggle("Redupkan saja saat jeda", isOn: Binding(
                        get: { manager.serverPrefs.pauseMode == "dim" },
                        set: { manager.serverPrefs.pauseMode = $0 ? "dim" : "hide" }
                    ))
                    Picker("Sembunyikan setelah", selection: $manager.serverPrefs.hideAfterPauseSec) {
                        Text("Segera").tag(0)
                        Text("1 menit").tag(60)
                        Text("5 menit").tag(300)
                        Text("15 menit").tag(900)
                        Text("Jangan").tag(-1)
                    }
                    .disabled(manager.serverPrefs.pauseMode == "dim")

                    Button {
                        Task {
                            saving = true
                            await manager.syncServerPrefs()
                            saving = false
                        }
                    } label: {
                        if saving {
                            ProgressView()
                        } else {
                            Text("Simpan preferensi jeda")
                        }
                    }
                } header: {
                    Text("Saat jeda")
                } footer: {
                    Text("Preferensi ini disimpan di server. Gaya visual hanya di iPhone.")
                }
            }
            .navigationTitle("Tampilan")
        }
    }
}
