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

struct VoiceScreen: View {
    @EnvironmentObject private var voice: SSCircleVoiceSession
    @AppStorage("voice.gateway") private var gateway = ""
    @AppStorage("voice.origin") private var websiteOrigin = ""
    @State private var code = ""
    @State private var group = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    Text("SSCircle Voice")
                        .font(.largeTitle).bold()
                    Text("Voice Minecraft Java ↔ Bedrock, dengan audio iOS native.")
                        .foregroundColor(.secondary)
                    Group {
                        Text("1. Konfigurasi Cloudflare (sekali saja)").font(.headline)
                        TextField("https://...workers.dev", text: $gateway)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .textFieldStyle(.roundedBorder)
                        TextField("Website origin (VOICE_ORIGIN)", text: $websiteOrigin)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .textFieldStyle(.roundedBorder)
                        Text("Alamat Origin harus sama persis dengan VOICE_ORIGIN pada Cloudflare Worker.")
                            .font(.caption).foregroundColor(.secondary)
                    }
                    Text("2. Ketik /voice link di Minecraft Bedrock").font(.headline)
                    TextField("Kode pairing 8 karakter", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                    Button("Hubungkan & aktifkan mikrofon") {
                        voice.connect(gateway: gateway, origin: websiteOrigin,
                                      code: code.uppercased())
                        code = ""
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(voice.active)
                    Button("Putuskan Voice") { voice.disconnect() }
                        .buttonStyle(.bordered)
                        .tint(.red)
                        .disabled(!voice.active)
                    Text(voice.status).font(.headline)
                    if !voice.player.isEmpty {
                        Text("Akun: \(voice.player)").foregroundColor(.secondary)
                    }
                    HStack {
                        Button(voice.muted ? "Unmute" : "Mute") {
                            voice.control(voice.muted ? "unmute" : "mute")
                        }
                        Button(voice.deafened ? "Undeafen" : "Deafen") {
                            voice.control(voice.deafened ? "undeafen" : "deafen")
                        }
                        Button(voice.whisper ? "Whisper ON" : "Whisper OFF") {
                            voice.control(voice.whisper ? "normal" : "whisper")
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(!voice.active)
                    TextField("Nama grup (opsional)", text: $group)
                        .textInputAutocapitalization(.never)
                        .textFieldStyle(.roundedBorder)
                    HStack {
                        Button("Gabung grup") { voice.control("group", value: group) }
                        Button("Keluar grup") { voice.control("leave-group") }
                    }
                    .buttonStyle(.bordered)
                    .disabled(!voice.active)
                    Text(voice.nearby).font(.subheadline)
                    Text("3. Buka Minecraft. iOS akan mencoba mempertahankan mikrofon dan suara saat aplikasi berpindah ke background. Panggilan telepon dan kebijakan audio game masih bisa menginterupsi sesi.")
                        .font(.caption).foregroundColor(.secondary)
                }
                .padding()
            }
            .navigationTitle("Voice")
            .navigationBarTitleDisplayMode(.inline)
        }
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

    func connect(gateway: String, origin: String, code: String) {
        guard !active else { return }
        guard let endpoint = normalized(gateway), let website = normalized(origin) else {
            status = "Alamat Gateway / Origin harus HTTPS tanpa path."
            return
        }
        guard code.range(of: "^[A-HJ-NP-Z2-9]{8}$", options: .regularExpression) != nil else {
            status = "Kode pairing harus 8 karakter dari /voice link."
            return
        }
        self.gateway = endpoint
        self.origin = website
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
                status = "Memeriksa pairing..."
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
