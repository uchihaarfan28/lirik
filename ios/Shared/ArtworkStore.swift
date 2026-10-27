import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Cover album di App Group: `artwork/<trackId>.jpg` (+ `.json` warna dominan opsional).
public enum ArtworkStore {
    private static let folderName = "artwork"
    private static let maxFiles = 20

    public static func sanitize(_ trackId: String) -> String {
        trackId
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "..", with: "_")
    }

    public static func directoryURL() -> URL? {
        AppGroup.containerURL?.appendingPathComponent(folderName, isDirectory: true)
    }

    public static func fileURL(for trackId: String) -> URL? {
        let safe = sanitize(trackId)
        guard !safe.isEmpty, let dir = directoryURL() else { return nil }
        return dir.appendingPathComponent("\(safe).jpg")
    }

    public static func colorURL(for trackId: String) -> URL? {
        let safe = sanitize(trackId)
        guard !safe.isEmpty, let dir = directoryURL() else { return nil }
        return dir.appendingPathComponent("\(safe).json")
    }

    public static func hasArtwork(for trackId: String) -> Bool {
        guard let url = fileURL(for: trackId) else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }

    public static func loadData(for trackId: String) -> Data? {
        guard let url = fileURL(for: trackId) else { return nil }
        return try? Data(contentsOf: url)
    }

#if canImport(UIKit)
    public static func loadImage(for trackId: String) -> UIImage? {
        guard let data = loadData(for: trackId) else { return nil }
        return UIImage(data: data)
    }
#endif

    public static func save(data: Data, for trackId: String, dominantRGB: (Double, Double, Double)? = nil) throws {
        guard let dir = directoryURL(), let file = fileURL(for: trackId) else {
            throw StoreError.unavailable
        }
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
        if let rgb = dominantRGB, let colorFile = colorURL(for: trackId) {
            let json: [String: Double] = ["r": rgb.0, "g": rgb.1, "b": rgb.2]
            try JSONSerialization.data(withJSONObject: json).write(to: colorFile, options: .atomic)
        }
        pruneIfNeeded()
    }

    public static func dominantRGB(for trackId: String) -> (Double, Double, Double)? {
        guard let url = colorURL(for: trackId),
              let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Double],
              let r = obj["r"], let g = obj["g"], let b = obj["b"]
        else { return nil }
        return (r, g, b)
    }

    private static func pruneIfNeeded() {
        guard let dir = directoryURL(),
              let files = try? FileManager.default.contentsOfDirectory(
                  at: dir,
                  includingPropertiesForKeys: [.contentModificationDateKey],
                  options: [.skipsHiddenFiles]
              )
        else { return }
        let jpgs = files.filter { $0.pathExtension.lowercased() == "jpg" }
        guard jpgs.count > maxFiles else { return }
        let sorted = jpgs.compactMap { url -> (URL, Date)? in
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return (url, date)
        }
        .sorted { $0.1 < $1.1 }
        let excess = sorted.count - maxFiles
        for i in 0 ..< excess {
            let url = sorted[i].0
            try? FileManager.default.removeItem(at: url)
            let color = url.deletingPathExtension().appendingPathExtension("json")
            try? FileManager.default.removeItem(at: color)
        }
    }

    public enum StoreError: Error {
        case unavailable
    }
}
