import AVFoundation
import Foundation

/// Full-duplex 48 kHz PCM16 audio. Native AVAudioSession allows audio capture
/// while Minecraft is foregrounded if iOS does not interrupt this session.
final class NativeVoiceAudio {
    var onAudioBatch: ((String) -> Void)?
    var onError: ((String) -> Void)?

    private let engine = AVAudioEngine()
    private let queue = DispatchQueue(label: "id.sscircle.voice.audio")
    private let monoFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                          sampleRate: 48_000, channels: 1,
                                          interleaved: false)!
    private var running = false
    private var speakerMode = true
    private var muted = false
    private var deafened = false
    private var inputSamples: [Float] = []
    private var pendingFrames: [String] = []
    private var speakers: [String: AVAudioPlayerNode] = [:]

    /// Switch native output without disconnecting WebSocket or microphone.
    /// Earphone mode uses the receiver; Speaker explicitly requests loudspeaker.
    /// iOS can still change the route when Bluetooth, calls, or Minecraft take audio.
    func setSpeakerMode(_ speaker: Bool) throws {
        let previous = speakerMode
        speakerMode = speaker
        guard running else { return }
        do {
            try configureRoute()
        } catch {
            speakerMode = previous
            try? configureRoute()
            throw error
        }
    }

    private func configureRoute() throws {
        let session = AVAudioSession.sharedInstance()
        let options: AVAudioSession.CategoryOptions = speakerMode
            ? [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
            : [.allowBluetooth, .mixWithOthers]
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: options)
        if running {
            try session.overrideOutputAudioPort(speakerMode ? .speaker : .none)
        }
    }

    func start() throws {
        if running { return }
        let session = AVAudioSession.sharedInstance()
        try configureRoute()
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.02)
        try session.setActive(true)
        try session.overrideOutputAudioPort(speakerMode ? .speaker : .none)

        let input = engine.inputNode
        let hardwareFormat = input.outputFormat(forBus: 0)
        guard let converter = AVAudioConverter(from: hardwareFormat, to: monoFormat) else {
            throw NSError(domain: "SSCircle", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Konversi mikrofon tidak tersedia"])
        }
        running = true
        input.installTap(onBus: 0, bufferSize: 1024, format: hardwareFormat) { [weak self] original, _ in
            guard let self else { return }
            let capacity = AVAudioFrameCount(
                max(2048.0, ceil(Double(original.frameLength) * 48_000 /
                                 hardwareFormat.sampleRate) + 256.0))
            guard let output = AVAudioPCMBuffer(pcmFormat: self.monoFormat,
                                               frameCapacity: capacity) else { return }
            var supplied = false
            var error: NSError?
            let status = converter.convert(to: output, error: &error) { _, inputStatus in
                if supplied {
                    inputStatus.pointee = .noDataNow
                    return nil
                }
                supplied = true
                inputStatus.pointee = .haveData
                return original
            }
            guard status != .error, output.frameLength > 0,
                  let channel = output.floatChannelData?[0] else { return }
            let values = Array(UnsafeBufferPointer(start: channel,
                                                    count: Int(output.frameLength)))
            self.queue.async { [weak self] in self?.capture(values) }
        }
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            running = false
            try? session.setActive(false)
            throw error
        }
    }

    func setMute(_ value: Bool) {
        queue.async { [weak self] in self?.muted = value }
    }

    func setDeafen(_ value: Bool) {
        queue.async { [weak self] in self?.deafened = value }
    }

    func stop() {
        guard running else { return }
        running = false
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        queue.sync {
            for node in speakers.values {
                node.stop()
                engine.detach(node)
            }
            speakers.removeAll()
            inputSamples.removeAll()
            pendingFrames.removeAll()
        }
        try? AVAudioSession.sharedInstance().setActive(false,
                          options: [.notifyOthersOnDeactivation])
    }

    private func capture(_ incoming: [Float]) {
        guard running else { return }
        inputSamples.append(contentsOf: incoming)
        while inputSamples.count >= 960 {
            let samples = Array(inputSamples.prefix(960))
            inputSamples.removeFirst(960)
            var energy = 0.0
            for v in samples { energy += Double(v * v) }
            if muted || sqrt(energy / 960.0) < 0.012 {
                pendingFrames.removeAll()
                continue
            }
            var pcm = Data(capacity: 1920)
            for sample in samples {
                let limited = max(-1.0, min(1.0, sample))
                let value = Int16(max(-32768, min(32767, Int((limited * 32767).rounded()))))
                var littleEndian = value.littleEndian
                withUnsafeBytes(of: &littleEndian) { pcm.append(contentsOf: $0) }
            }
            pendingFrames.append(pcm.base64EncodedString())
            if pendingFrames.count == 3 {
                let payload: [String: Any] = [
                    "t": "audioBatch",
                    "frames": pendingFrames.map { ["pcm": $0] }
                ]
                if let bytes = try? JSONSerialization.data(withJSONObject: payload),
                   let string = String(data: bytes, encoding: .utf8) {
                    onAudioBatch?(string)
                }
                pendingFrames.removeAll()
            }
        }
    }

    func receive(_ event: [String: Any]) {
        queue.async { [weak self] in self?.play(event) }
    }

    private func play(_ event: [String: Any]) {
        guard running, !deafened, let id = event["uuid"] as? String else { return }
        let frames = (event["frames"] as? [[String: Any]]) ??
            (event["pcm"] is String ? [event] : [])
        if frames.isEmpty || frames.count > 4 { return }
        let dx = (event["dx"] as? NSNumber)?.doubleValue ?? 0
        let dy = (event["dy"] as? NSNumber)?.doubleValue ?? 0
        let dz = (event["dz"] as? NSNumber)?.doubleValue ?? 0
        let yaw = ((event["yaw"] as? NSNumber)?.doubleValue ?? 0) * .pi / 180
        let x = -(dx * cos(yaw) + dz * sin(yaw))
        let z = -(dz * cos(yaw) - dx * sin(yaw))
        let distance = sqrt(dx * dx + dy * dy + dz * dz)
        let volume = distance <= 2 ? 1.0 : 1.0 / (1.0 + 1.3 * (distance - 2.0) / 2.0)
        let pan = max(-1, min(1, x / max(1, hypot(x, z))))

        let node: AVAudioPlayerNode
        if let current = speakers[id] {
            node = current
        } else {
            node = AVAudioPlayerNode()
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: monoFormat)
            node.play()
            speakers[id] = node
        }
        node.volume = Float(volume)
        node.pan = Float(pan)
        for frame in frames {
            guard let encoded = frame["pcm"] as? String,
                  let bytes = Data(base64Encoded: encoded), bytes.count == 1920,
                  let buffer = AVAudioPCMBuffer(pcmFormat: monoFormat,
                                               frameCapacity: 960),
                  let channel = buffer.floatChannelData?[0] else { continue }
            buffer.frameLength = 960
            bytes.withUnsafeBytes { raw in
                let data = raw.bindMemory(to: UInt8.self)
                for i in 0..<960 {
                    let bits = UInt16(data[2 * i]) | (UInt16(data[2 * i + 1]) << 8)
                    let value = Int16(bitPattern: bits)
                    channel[i] = Float(value) / 32768.0
                }
            }
            node.scheduleBuffer(buffer)
        }
    }
}
