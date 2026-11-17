// ocr: Apple Vision text recognition. Read-only, local, no network.
// usage: ocr <image.png> [--scale S] [--crop x,y,w,h[@scale]]...
// Crops are in image pixels, top-left origin. Output JSON: {"w":..,"h":..,"items":[{"t":text,"c":conf,"x","y","w","h"}]}
// with boxes in full-image pixels (top-left origin).
import Foundation
import Vision
import CoreGraphics
import ImageIO

func fail(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }

var args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else { fail("usage: ocr <image> [--scale S] [--crop x,y,w,h]...") }
let path = args.removeFirst()
var scale: CGFloat = 1.0
var crops: [(CGRect, CGFloat?)] = []
while !args.isEmpty {
    let a = args.removeFirst()
    if a == "--scale", !args.isEmpty { scale = CGFloat(Double(args.removeFirst()) ?? 1.0) }
    else if a == "--crop", !args.isEmpty {
        let parts = args.removeFirst().split(separator: "@")
        let p = parts[0].split(separator: ",").compactMap { Double($0) }
        let cs: CGFloat? = parts.count > 1 ? Double(parts[1]).map { CGFloat($0) } : nil
        if p.count == 4 { crops.append((CGRect(x: p[0], y: p[1], width: p[2], height: p[3]), cs)) }
    }
}
guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
      let full = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("cannot read image") }
let W = CGFloat(full.width), H = CGFloat(full.height)
if crops.isEmpty { crops = [(CGRect(x: 0, y: 0, width: W, height: H), nil)] }

func scaled(_ img: CGImage, _ s: CGFloat) -> CGImage {
    if s == 1.0 { return img }
    let w = Int(CGFloat(img.width) * s), h = Int(CGFloat(img.height) * s)
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return img }
    ctx.interpolationQuality = .high
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    return ctx.makeImage() ?? img
}

var items: [[String: Any]] = []
for (r0, cs) in crops {
    let r = r0.intersection(CGRect(x: 0, y: 0, width: W, height: H)).integral
    if r.isEmpty { continue }
    guard let cut = full.cropping(to: r) else { continue }
    let img = scaled(cut, cs ?? scale)
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["en-US"]
    req.usesLanguageCorrection = false
    let h = VNImageRequestHandler(cgImage: img, options: [:])
    do { try h.perform([req]) } catch { continue }
    for o in req.results ?? [] {
        guard let cand = o.topCandidates(1).first else { continue }
        let b = o.boundingBox // normalized, bottom-left origin, relative to crop
        let x = r.minX + b.minX * r.width
        let y = r.minY + (1 - b.maxY) * r.height
        items.append(["t": cand.string, "c": Double(cand.confidence),
                      "x": Double(x), "y": Double(y), "w": Double(b.width * r.width), "h": Double(b.height * r.height)])
    }
}
let out: [String: Any] = ["w": Double(W), "h": Double(H), "items": items]
let d = try! JSONSerialization.data(withJSONObject: out, options: [])
print(String(data: d, encoding: .utf8)!)
