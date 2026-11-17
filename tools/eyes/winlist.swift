// winlist: prints JSON of on-screen Bookmap windows (read-only; uses CGWindowList, sends no input).
import Foundation
import CoreGraphics

let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
var out: [[String: Any]] = []
if let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
    for w in list {
        let owner = (w[kCGWindowOwnerName as String] as? String) ?? ""
        if !owner.lowercased().contains("bookmap") { continue }
        let title = (w[kCGWindowName as String] as? String) ?? ""
        let id = (w[kCGWindowNumber as String] as? Int) ?? 0
        let layer = (w[kCGWindowLayer as String] as? Int) ?? 0
        var width = 0, height = 0
        if let b = w[kCGWindowBounds as String] as? [String: Any] {
            width = (b["Width"] as? Int) ?? Int((b["Width"] as? Double) ?? 0)
            height = (b["Height"] as? Int) ?? Int((b["Height"] as? Double) ?? 0)
        }
        out.append(["id": id, "owner": owner, "title": title, "layer": layer, "w": width, "h": height])
    }
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [])
print(String(data: data, encoding: .utf8)!)
