// HTT Eyes.app — tiny launcher for the local "eyes" helper.
// The site button opens the link htt-eyes://start; macOS launches this app; the app starts
// eyes_server.py in "exit when off" mode and quits as soon as the server quits.
// Launching alone never captures anything: capture starts only on POST /start from an allowed origin.
import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    var child: Process?

    func applicationDidFinishLaunching(_ note: Notification) {
        // First run: ask macOS for the "screen recording" permission so the app shows up in System Settings.
        if !CGPreflightScreenCaptureAccess() { CGRequestScreenCaptureAccess() }
        startServer()
    }
    func application(_ application: NSApplication, open urls: [URL]) { /* the launch itself is the signal */ }

    func startServer() {
        guard child == nil else { return }
        let res = Bundle.main.resourcePath ?? ""
        guard let raw = try? String(contentsOfFile: res + "/eyes_dir.txt", encoding: .utf8) else { NSApp.terminate(nil); return }
        let dir = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard FileManager.default.fileExists(atPath: dir + "/eyes_server.py") else { NSApp.terminate(nil); return }

        let home = NSHomeDirectory()
        let data = home + "/.local/share/htt-eyes"
        try? FileManager.default.createDirectory(atPath: data + "/logs", withIntermediateDirectories: true)
        let logPath = data + "/server.log"
        if !FileManager.default.fileExists(atPath: logPath) { FileManager.default.createFile(atPath: logPath, contents: nil) }

        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        p.arguments = [dir + "/eyes_server.py"]
        p.currentDirectoryURL = URL(fileURLWithPath: dir)
        var env = ProcessInfo.processInfo.environment
        env["HTT_EYES_EXIT_WHEN_OFF"] = "1"
        env["LC_ALL"] = "en_US.UTF-8"
        env["LANG"] = "en_US.UTF-8"
        env["PATH"] = home + "/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        p.environment = env
        if let fh = FileHandle(forWritingAtPath: logPath) {
            fh.seekToEndOfFile()
            p.standardOutput = fh
            p.standardError = fh
        }
        p.terminationHandler = { _ in DispatchQueue.main.async { NSApp.terminate(nil) } }
        do { try p.run(); child = p } catch { NSApp.terminate(nil) }
    }

    func applicationWillTerminate(_ note: Notification) {
        if let c = child, c.isRunning { c.terminate() }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
