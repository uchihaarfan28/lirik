import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var manager: ActivityManager
    @Environment(\.openURL) private var openURL
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://lirik.domainanda.com", text: $manager.serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("API key", text: $manager.apiKey)
                    if let err = manager.connectionError {
                        Label(err, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                } header: {
                    Text("Server")
                }

                Section("Spotify") {
                    statusRow("Akun terhubung", manager.status?.spotifyConnected)
                    Button("Hubungkan akun Spotify") {
                        run {
                            if let url = await manager.spotifyLoginURL() { openURL(url) }
                        }
                    }
                }

                Section("Sedang diputar") {
                    if let s = manager.status, let np = s.nowPlaying {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Image(systemName: np.isPlaying ? "play.fill" : "pause.fill")
                                    .foregroundStyle(.green)
                                Text("\(np.title) — \(np.artist)")
                                    .font(.subheadline)
                                    .lineLimit(1)
                            }
                            Text(s.line).font(.title3.bold())
                            if !s.nextLine.isEmpty {
                                Text(s.nextLine).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    } else {
                        Text("Belum ada lagu. Buka Spotify dan putar lagu.")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    statusRow("Live Activity aktif", manager.activityActive)
                    statusRow("Server pegang token update", manager.status?.activityRegistered)
                    statusRow("Auto-start siap", manager.status?.pushToStartRegistered)
                    statusRow("Update sering diizinkan", manager.frequentUpdatesEnabled)
                    Button("Tampilkan lirik di Dynamic Island") { run { await manager.startActivity() } }
                    Button("Kirim tes push") { run { await manager.testPush() } }
                    Button("Hentikan", role: .destructive) { run { await manager.stopActivity() } }
                } header: {
                    Text("Live Activity")
                } footer: {
                    Text("Live Activity otomatis ikut tampil di CarPlay Dashboard (iOS 26+). Kalau lirik sering telat, pastikan Settings › Lirik Island › Live Activities › More Frequent Updates menyala.")
                }

                if let push = manager.status?.lastPush {
                    Section("Push terakhir") {
                        Text("\(push.event) · \(push.ok ? "OK" : "gagal \(push.status) \(push.reason ?? "")")")
                            .font(.footnote.monospaced())
                            .foregroundStyle(push.ok ? Color.secondary : Color.red)
                    }
                }
                if let err = manager.status?.lastError {
                    Section("Catatan server") {
                        Text(err).font(.footnote).foregroundStyle(.orange)
                    }
                }
                if let msg = manager.message {
                    Section { Text(msg).font(.footnote) }
                }
            }
            .navigationTitle("Lirik Island")
            .disabled(busy)
            .task {
                manager.startObserving()
                while !Task.isCancelled {
                    await manager.refreshStatus()
                    try? await Task.sleep(for: .seconds(3))
                }
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

    private func statusRow(_ label: String, _ value: Bool?) -> some View {
        LabeledContent(label) {
            Image(systemName: value == true ? "checkmark.circle.fill" : value == false ? "xmark.circle" : "minus.circle")
                .foregroundStyle(value == true ? Color.green : Color.secondary)
        }
    }
}
