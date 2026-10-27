import Foundation
import UIKit

enum DeviceIdentity {
    /// ID stabil per instalasi app (identifierForVendor).
    @MainActor
    static var deviceId: String {
        UIDevice.current.identifierForVendor?.uuidString.lowercased() ?? "unknown"
    }
}
