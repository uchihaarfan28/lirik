import Foundation

/// Preferensi visual di App Group — dibaca widget tanpa server.
public struct DisplayPreferences: Equatable, Sendable {
    public enum LockScreenStyle: String, CaseIterable, Sendable {
        case classic
        case cover
        case minimal
    }

    public enum IslandCompact: String, CaseIterable, Sendable {
        case lyric
        case icon
    }

    public enum Accent: String, CaseIterable, Sendable {
        case hijauSpotify
        case warnaCover
        case putih
    }

    public var lockScreenStyle: LockScreenStyle
    public var islandCompact: IslandCompact
    public var showNextLine: Bool
    public var accent: Accent
    public var showProgress: Bool

    public static let `default` = DisplayPreferences(
        lockScreenStyle: .classic,
        islandCompact: .lyric,
        showNextLine: true,
        accent: .hijauSpotify,
        showProgress: true
    )

    private enum Key {
        static let lockScreenStyle = "display.lockScreenStyle"
        static let islandCompact = "display.islandCompact"
        static let showNextLine = "display.showNextLine"
        static let accent = "display.accent"
        static let showProgress = "display.showProgress"
    }

    public static func load(from defaults: UserDefaults? = AppGroup.defaults) -> DisplayPreferences {
        guard let d = defaults else { return .default }
        return DisplayPreferences(
            lockScreenStyle: LockScreenStyle(rawValue: d.string(forKey: Key.lockScreenStyle) ?? "") ?? .classic,
            islandCompact: IslandCompact(rawValue: d.string(forKey: Key.islandCompact) ?? "") ?? .lyric,
            showNextLine: d.object(forKey: Key.showNextLine) as? Bool ?? true,
            accent: Accent(rawValue: d.string(forKey: Key.accent) ?? "") ?? .hijauSpotify,
            showProgress: d.object(forKey: Key.showProgress) as? Bool ?? true
        )
    }

    public func save(to defaults: UserDefaults? = AppGroup.defaults) {
        guard let d = defaults else { return }
        d.set(lockScreenStyle.rawValue, forKey: Key.lockScreenStyle)
        d.set(islandCompact.rawValue, forKey: Key.islandCompact)
        d.set(showNextLine, forKey: Key.showNextLine)
        d.set(accent.rawValue, forKey: Key.accent)
        d.set(showProgress, forKey: Key.showProgress)
    }
}
