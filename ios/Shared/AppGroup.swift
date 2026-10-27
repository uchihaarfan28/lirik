import Foundation

/// App Group bersama app + widget. ID di-derive dari bundle agar xtool rewrite konsisten.
public enum AppGroup {
    /// `group.` + bundle app (hapus sufiks `.LirikIslandWidget` bila ada).
    public static var id: String {
        let bundle = Bundle.main.bundleIdentifier ?? "com.savage.lirikisland"
        let appBundle: String
        if bundle.hasSuffix(".LirikIslandWidget") {
            appBundle = String(bundle.dropLast(".LirikIslandWidget".count))
        } else if bundle.hasSuffix(".widget") {
            appBundle = String(bundle.dropLast(".widget".count))
        } else {
            appBundle = bundle
        }
        return appBundle.hasPrefix("group.") ? appBundle : "group.\(appBundle)"
    }

    public static var defaults: UserDefaults? {
        UserDefaults(suiteName: id)
    }

    public static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    }

    public static var isAvailable: Bool {
        containerURL != nil && defaults != nil
    }
}
