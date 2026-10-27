import LyricsShared
import SwiftUI

struct StatusView: View {
    @EnvironmentObject private var manager: ActivityManager
    @Environment(\.openURL) private var openURL
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    LabeledContent("Host", value: manager.serverHost)
                    if let err = manager.connectionError {
                        Label(err, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    } else {
                        Label("Terhubung", systemImage: "checkmark.circle.fill")
                            .font(.footnote)
                            .foregroundStyle(.green)
                    }
                }

                Section("Spotify") {
                    statusRow("Akun terhubung", manager.status?.spotifyConnected)
                    Button("Hubungkan akun Spotify") {
                        run {
                            if let url = await manager.spotifyLoginURL() { openURL(url) }
                        }
                    }
                }

                Section("Live Activity") {
                    statusRow("Aktif di iPhone", manager.activityActive)
                    statusRow("Token di server", manager.status?.activityRegistered)
                    statusRow("Auto-start siap", manager.status?.pushToStartRegistered)
                    statusRow("Update sering", manager.frequentUpdatesEnabled)
                    Button("Kirim tes push") { run { await manager.testPush() } }
                }

                Section("App Group") {
                    statusRow("Tersedia", manager.appGroupOK)
                    if let path = AppGroup.containerURL?.path {
                        Text(path)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                    }
                }

                if let push = manager.status?.lastPush {
                    Section("Push terakhir") {
                        Text("\(push.event) · \(push.ok ? "OK" : "gagal \(push.status)")")
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
            .navigationTitle("Status")
            .disabled(busy)
            .refreshable { await manager.refreshStatus() }
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
