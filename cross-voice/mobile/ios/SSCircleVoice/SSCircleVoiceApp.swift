import SwiftUI
import AVFoundation
import Foundation

@main
struct SSCircleVoiceApp: App {
    @StateObject private var voice = SSCircleVoiceSession()
    var body: some Scene {
        WindowGroup {
            VoiceScreen().environmentObject(voice)
        }
    }
}

private enum VoiceTheme {
    static let background = Color(red:12/255, green:24/255, blue:39/255)
    static let panel = Color(red:20/255, green:38/255, blue:58/255)
    static let card = Color(red:24/255, green:45/255, blue:67/255)
    static let border = Color(red:53/255, green:83/255, blue:110/255)
    static let foreground = Color(red:244/255, green:247/255, blue:255/255)
    static let muted = Color(red:163/255, green:185/255, blue:204/255)
    static let accent = Color(red:189/255, green:229/255, blue:252/255)
    static let cyan = Color(red:124/255, green:196/255, blue:242/255)
}

private struct VoicePanel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(RoundedRectangle(cornerRadius: 18).fill(VoiceTheme.panel))
            .overlay(RoundedRectangle(cornerRadius: 18)
                .stroke(VoiceTheme.border, lineWidth: 1))
    }
}

private struct VoiceActionStyle: ButtonStyle {
    var prominent = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(prominent ? VoiceTheme.background : VoiceTheme.foreground)
            .frame(maxWidth: .infinity, minHeight: 49)
            .background(RoundedRectangle(cornerRadius: 11)
                .fill(prominent ? VoiceTheme.accent : VoiceTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 11)
                .stroke(prominent ? Color.clear : VoiceTheme.border, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

struct VoiceScreen: View {
    @EnvironmentObject private var voice: SSCircleVoiceSession
    @State private var code = ""
    @State private var group = ""

    private func eyebrow(_ value: String) -> some View {
        Text(value).font(.system(size: 11, weight: .bold))
            .tracking(2).foregroundColor(VoiceTheme.cyan)
    }

    private func darkField(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .font(.system(size: 16))
            .foregroundColor(VoiceTheme.foreground)
            .padding(.horizontal, 14)
            .frame(height: 52)
            .background(RoundedRectangle(cornerRadius: 11).fill(VoiceTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 11)
                .stroke(VoiceTheme.border, lineWidth: 1))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 13) {
                    Image("sscircle-logo")
                        .resizable().scaledToFit()
                        .frame(width: 64, height: 64)
                        .accessibilityLabel("Logo SSCircle")
                    VStack(alignment: .leading, spacing: 5) {
                        eyebrow("VOICE / CROSS-PLATFORM")
                        Text("SSCircle Voice")
                            .font(.system(size: 27, weight: .bold))
                            .foregroundColor(VoiceTheme.foreground)
                        Text("Java + Bedrock • Voice Chat")
                            .font(.system(size: 12))
                            .foregroundColor(VoiceTheme.muted)
                    }
                }
                .padding(.bottom, 4)

                VoicePanel {
                    eyebrow("●  SSCIRCLE NETWORK")
                    Text(voice.active ? "Gateway terhubung otomatis" :
                        "Konfigurasi otomatis dari SSCircle")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(VoiceTheme.foreground)
                }

                VoicePanel {
                    eyebrow("01 / PAIRING")
                    Text("Hubungkan akun Minecraft")
                        .font(.system(size: 21, weight: .bold))
                        .foregroundColor(VoiceTheme.foreground)
                    Text("Masuk server Bedrock, jalankan /voice link, lalu masukkan kode 8 karakter.")
                        .font(.system(size: 14))
                        .foregroundColor(VoiceTheme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    darkField("Kode pairing 8 karakter", text: $code)
                        .textInputAutocapitalization(.characters)
                    Button("Hubungkan ke Voice") {
                        voice.connect(code: code.uppercased().trimmingCharacters(in: .whitespacesAndNewlines))
                        code = ""
                    }
                    .buttonStyle(VoiceActionStyle(prominent: true))
                    .disabled(voice.active)
                    Text("Gateway dan Origin akan terdeteksi otomatis. Kode berlaku 2 menit.")
                        .font(.system(size: 12))
                        .foregroundColor(VoiceTheme.muted)
                }

                VoicePanel {
                    eyebrow("02 / VOICE ROOM")
                    Text("Live Voice Control")
                        .font(.system(size: 21, weight: .bold))
                        .foregroundColor(VoiceTheme.foreground)
                    Text(voice.player.isEmpty ? "Minecraft belum ditautkan" : "@" + voice.player)
                        .font(.system(size: 13))
                        .foregroundColor(VoiceTheme.muted)
                    Text(voice.status)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(VoiceTheme.foreground)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 8) {
                        Button(voice.muted ? "Unmute" : "Mute") {
                            voice.control(voice.muted ? "unmute" : "mute")
                        }
                        .buttonStyle(VoiceActionStyle())
                        Button(voice.deafened ? "Undeafen" : "Deafen") {
                            voice.control(voice.deafened ? "undeafen" : "deafen")
                        }
                        .buttonStyle(VoiceActionStyle())
                    }
                    HStack(spacing: 8) {
                        Button(voice.whisper ? "Whisper ON" : "Whisper OFF") {
                            voice.control(voice.whisper ? "normal" : "whisper")
                        }
                        .buttonStyle(VoiceActionStyle())
                        Button("Disconnect") { voice.disconnect() }
                            .buttonStyle(VoiceActionStyle())
                    }
                    .disabled(!voice.active)
                }

                VoicePanel {
                    eyebrow("03 / MODE SUARA")
                    Text("Proximity & Group")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(VoiceTheme.foreground)
                    Text("Proximity aktif otomatis. Gunakan grup untuk kanal bersama.")
                        .font(.system(size: 13))
                        .foregroundColor(VoiceTheme.muted)
                    darkField("Nama grup (opsional)", text: $group)
                    HStack(spacing: 8) {
                        Button("Gabung grup") {
                            voice.control("group", value: group)
                        }
                        .buttonStyle(VoiceActionStyle(prominent: true))
                        Button("Keluar grup") {
                            voice.control("leave-group")
                        }
                        .buttonStyle(VoiceActionStyle())
                    }
                    .disabled(!voice.active)
                }

                VoicePanel {
                    eyebrow("PEMAIN YANG TERDENGAR")
                    Text(voice.nearby)
                        .font(.system(size: 14))
                        .foregroundColor(VoiceTheme.foreground)
                }
                Text("BACKGROUND VOICE  •  Aplikasi mencoba mempertahankan mikrofon saat membuka Minecraft. Panggilan, Bluetooth, dan kebijakan iOS dapat menginterupsi audio.")
                    .font(.system(size: 12))
                    .foregroundColor(VoiceTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 5)
            }
            .padding(18)
        }
        .background(VoiceTheme.background.ignoresSafeArea())
        .preferredColorScheme(.dark)
    }
}

@MainActor
final class SSCircleVoiceSession: ObservableObject {
    @Published private(set) var status = "Belum terhubung"
    @Published private(set) var active = false
    @Published private(set) var muted = false
    @Published private(set) var deafened = false
    @Published private(set) var whisper = false
    @Published private(set) var player = ""
    @Published private(set) var nearby = "Pemain terdekat: -"

    private var gateway = ""
    private var origin = ""
    private var token = ""
    private var expiresAt = Date.distantPast
    private var socket: URLSessionWebSocketTask?
    private var connectionTask: Task<Void, Never>?
    private var refreshTask: Task<Void, Never>?
    private let audio = NativeVoiceAudio()
    private var interruptionObserver: NSObjectProtocol?

    init() {
        audio.onAudioBatch = { [weak self] batch in
            Task { @MainActor [weak self] in
                guard let self, self.active, !self.muted, let socket = self.socket else { return }
                try? await socket.send(.string(batch))
            }
        }
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
        ) { [weak self] notification in
            guard let kind = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else {
                return
            }
            Task { @MainActor [weak self] in
                guard let self, self.active else { return }
                if kind == AVAudioSession.InterruptionType.began.rawValue {
                    self.status = "Audio diinterupsi oleh iOS / aplikasi lain"
                } else {
                    self.audio.stop()
                    do { try self.audio.start() }
                    catch { self.status = "Perlu pulihkan mikrofon: \(error.localizedDescription)" }
                }
            }
        }
    }

    private func normalized(_ address: String) -> String? {
        let input = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URLComponents(string: input),
              url.scheme?.lowercased() == "https",
              let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil, url.query == nil,
              url.fragment == nil, (url.path.isEmpty || url.path == "/") else {
            return nil
        }
        let port = url.port.map { ":\($0)" } ?? ""
        return "https://" + host.lowercased() + port
    }

    private func discoverConfiguration() async throws {
        // A single known HTTPS SSCircle website acts as a trusted native bootstrap.
        let configuredSite = Bundle.main.object(forInfoDictionaryKey: "SSCVoiceBootstrapURL") as? String
            ?? "https://voice-test.sscircle.pages.dev"
        guard let site = normalized(configuredSite),
              let url = URL(string: site + "/api/voice/mobile-config") else {
            throw voiceError("Domain bootstrap SSCircle pada aplikasi tidak valid.")
        }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 12
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse,
              let actual = http.url?.scheme.flatMap({ scheme -> String? in
                  guard scheme.lowercased() == "https", let host = http.url?.host else { return nil }
                  let port = http.url?.port.map { ":\($0)" } ?? ""
                  return "https://" + host.lowercased() + port
              }),
              actual == site else {
            throw voiceError("Konfigurasi SSCircle dialihkan ke domain tidak terpercaya.")
        }
        guard http.statusCode == 200,
              let dataObject = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              dataObject["ready"] as? Bool == true,
              let originString = dataObject["origin"] as? String,
              let gatewayString = dataObject["gateway"] as? String,
              let newOrigin = normalized(originString),
              let newGateway = normalized(gatewayString),
              newOrigin == site else {
            throw voiceError("Gateway belum aktif atau pengaturan VOICE_PUBLIC_URL salah.")
        }
        gateway = newGateway
        origin = newOrigin
    }

    func connect(code: String) {
        guard !active else { return }
        guard code.range(of: "^[A-HJ-NP-Z2-9]{8}$", options: .regularExpression) != nil else {
            status = "Kode pairing harus 8 karakter dari /voice link."
            return
        }
        active = true
        status = "Meminta izin mikrofon..."
        connectionTask = Task {
            let granted = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                    continuation.resume(returning: allowed)
                }
            }
            guard active else { return }
            guard granted else {
                status = "Izin mikrofon ditolak. Aktifkan melalui Pengaturan iOS."
                active = false
                return
            }
            do {
                status = "Mencari gateway SSCircle..."
                try await discoverConfiguration()
                guard active else { return }
                status = "Gateway ditemukan. Memeriksa pairing..."
                let result = try await post("/api/pair", body: ["code": code])
                guard active else { return }
                guard let bearer = result["token"] as? String,
                      let info = result["player"] as? [String: Any],
                      let name = info["name"] as? String else {
                    throw voiceError("Respons pairing tidak lengkap")
                }
                token = bearer
                player = name
                expiresAt = Date().addingTimeInterval(
                    (result["expiresIn"] as? NSNumber)?.doubleValue ?? 900)
                try audio.start()
                refreshTask = Task { [weak self] in
                    while let self, !Task.isCancelled, self.active {
                        try? await Task.sleep(nanoseconds: 60_000_000_000)
                        guard !Task.isCancelled, self.active else { break }
                        await self.renewIfNeeded()
                    }
                }
                await socketLoop()
            } catch {
                if active {
                    status = "Voice gagal: \(error.localizedDescription)"
                    disconnect(preserveStatus: true)
                }
            }
        }
    }

    private func voiceError(_ reason: String) -> NSError {
        NSError(domain: "SSCircleVoice", code: 1,
                userInfo: [NSLocalizedDescriptionKey: reason])
    }
    private func post(_ path: String, bearer: String? = nil,
                      body: [String: Any] = [:]) async throws -> [String: Any] {
        guard let address = URL(string: gateway + path) else { throw voiceError("URL gateway salah") }
        var req = URLRequest(url: address)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue(origin, forHTTPHeaderField: "Origin")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let bearer { req.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw voiceError(json["error"] as? String ?? "Gateway tidak merespons")
        }
        return json
    }

    private func socketLoop() async {
        var retries = 0
        while active && !Task.isCancelled {
            if Date() >= expiresAt {
                status = "Sesi habis. Ketik /voice link lagi."
                disconnect(preserveStatus: true)
                break
            }
            do {
                status = "Menghubungkan WebSocket..."
                let ticket = try await post("/api/ticket", bearer: token)
                guard active, let value = ticket["ticket"] as? String,
                      let url = URL(string: gateway.replacingOccurrences(
                        of: "https://", with: "wss://") + "/ws?ticket=" + value) else {
                    return
                }
                var request = URLRequest(url: url)
                request.setValue(origin, forHTTPHeaderField: "Origin")
                let task = URLSession.shared.webSocketTask(with: request)
                socket = task
                task.resume()
                retries = 0
                while active && !Task.isCancelled && socket === task {
                    let message = try await task.receive()
                    switch message {
                    case .string(let value):
                        if let data = value.data(using: .utf8),
                           let event = try? JSONSerialization.jsonObject(with: data)
                                as? [String: Any] {
                            receive(event)
                        }
                    case .data(let value):
                        if let event = try? JSONSerialization.jsonObject(with: value)
                            as? [String: Any] { receive(event) }
                    @unknown default: break
                    }
                }
            } catch {
                if !active { break }
                if error.localizedDescription.contains("SESSION_EXPIRED") {
                    status = "Sesi habis. Gunakan /voice link lagi."
                    disconnect(preserveStatus: true)
                    break
                }
                status = "Koneksi terputus, mencoba menyambung ulang..."
            }
            socket?.cancel(with: .goingAway, reason: nil)
            socket = nil
            guard active && !Task.isCancelled else { break }
            retries += 1
            let delay = min(30, 2 * (1 << min(4, retries)))
            try? await Task.sleep(nanoseconds: UInt64(delay) * 1_000_000_000)
        }
    }

    private func receive(_ event: [String: Any]) {
        let type = event["t"] as? String ?? ""
        if type == "audio" || type == "audioBatch" {
            audio.receive(event)
            return
        }
        if type != "state" { return }
        status = "Terhubung • background audio aktif"
        if let myself = event["self"] as? [String: Any] {
            muted = myself["muted"] as? Bool ?? muted
            deafened = myself["deafened"] as? Bool ?? deafened
            whisper = myself["whisper"] as? Bool ?? whisper
            audio.setMute(muted)
            audio.setDeafen(deafened)
        }
        let names = (event["nearby"] as? [[String: Any]] ?? []).compactMap { p -> String? in
            guard let name = p["name"] as? String else { return nil }
            return name + " (" + String(describing: p["distance"] ?? "?") + " blok)"
        }
        nearby = names.isEmpty ? "Pemain terdekat: -" : "Pemain terdekat: " + names.joined(separator: ", ")
    }

    private func renewIfNeeded() async {
        guard active, !token.isEmpty, expiresAt.timeIntervalSinceNow <= 300 else { return }
        do {
            let result = try await post("/api/renew", bearer: token)
            if let rotated = result["token"] as? String {
                token = rotated
                expiresAt = Date().addingTimeInterval(
                    (result["expiresIn"] as? NSNumber)?.doubleValue ?? 900)
            }
        } catch {
            if error.localizedDescription.contains("SESSION_EXPIRED") {
                status = "Sesi habis. Gunakan /voice link lagi."
                disconnect(preserveStatus: true)
            }
        }
    }

    func control(_ action: String, value: String = "") {
        guard active else { return }
        let supported = ["mute", "unmute", "deafen", "undeafen",
                         "whisper", "normal", "group", "leave-group"]
        guard supported.contains(action) else { return }
        if action == "group" && value.range(of: "^[A-Za-z0-9_-]{1,24}$",
                  options: .regularExpression) == nil {
            status = "Nama grup hanya 1–24 karakter (a-z, 0-9, _ atau -)"
            return
        }
        switch action {
        case "mute": muted = true
        case "unmute": muted = false
        case "deafen": deafened = true
        case "undeafen": deafened = false
        case "whisper": whisper = true
        case "normal": whisper = false
        default: break
        }
        audio.setMute(muted)
        audio.setDeafen(deafened)
        let payload: [String: String] = ["t": "control", "action": action, "value": value]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let str = String(data: data, encoding: .utf8) {
            Task { try? await socket?.send(.string(str)) }
        }
    }

    func disconnect(preserveStatus: Bool = false) {
        let previous = status
        active = false
        connectionTask?.cancel()
        refreshTask?.cancel()
        connectionTask = nil
        refreshTask = nil
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        audio.stop()
        let currentToken = token
        token = ""
        player = ""
        muted = false
        deafened = false
        whisper = false
        nearby = "Pemain terdekat: -"
        status = preserveStatus ? previous : "Voice terputus"
        if !currentToken.isEmpty {
            Task { try? await post("/api/disconnect", bearer: currentToken) }
        }
    }
}
