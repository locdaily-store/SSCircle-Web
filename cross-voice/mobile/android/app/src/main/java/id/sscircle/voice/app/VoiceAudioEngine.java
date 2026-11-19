package id.sscircle.voice.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.util.Base64;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.LockSupport;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Native 48kHz/mono/PCM16 microphone and 48kHz/stereo playback.
 * Matches the existing Cloudflare gateway: 960 samples (20ms), 1920 bytes,
 * base64 2560 chars, 1–4 frames per audioBatch.
 * No microphone samples are saved to disk.
 */
final class VoiceAudioEngine {
    interface Sender { void send(String json); }
    interface Failure { void fail(String error); }
    private static final int RATE = 48000, SAMPLES = 960, BYTES = 1920;
    private final Context context;
    private final Sender sender;
    private final Failure onFailure;
    private final Object monitor = new Object();
    private final Map<String, Stream> incoming = new HashMap<>();
    private volatile boolean running, muted, deafened;
    private volatile Thread microphoneThread, speakerThread;
    private volatile AudioRecord record;

    private static final class Frame {
        final byte[] pcm;
        final float left, right;
        Frame(byte[] bytes, float l, float r) { pcm = bytes; left = l; right = r; }
    }
    private static final class Stream {
        final ArrayDeque<Frame> frames = new ArrayDeque<>();
        long lastArrival;
        boolean primed;
    }
    VoiceAudioEngine(Context ctx, Sender sender, Failure onFailure) {
        context = ctx.getApplicationContext();
        this.sender = sender;
        this.onFailure = onFailure;
    }
    void mute(boolean value) { muted = value; }
    void deafen(boolean value) {
        deafened = value;
        if (value) synchronized (monitor) { incoming.clear(); }
    }
    synchronized void start() {
        if (running) return;
        running = true;
        microphoneThread = new Thread(this::capture, "SSCircle-Voice-Mic");
        speakerThread = new Thread(this::play, "SSCircle-Voice-Speaker");
        microphoneThread.start();
        speakerThread.start();
    }
    synchronized void stop() {
        running = false;
        AudioRecord r = record;
        if (r != null) try { r.stop(); } catch (RuntimeException ignored) {}
        if (microphoneThread != null) microphoneThread.interrupt();
        if (speakerThread != null) speakerThread.interrupt();
        synchronized (monitor) { incoming.clear(); }
    }
    private void capture() {
        AudioRecord mic = null;
        AcousticEchoCanceler echo = null;
        NoiseSuppressor noise = null;
        try {
            if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) throw new SecurityException("Izin mikrofon tidak tersedia");
            int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
            if (min <= 0) throw new IllegalStateException("AudioRecord 48kHz tidak didukung");
            mic = new AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
                Math.max(min, BYTES * 8));
            if (mic.getState() != AudioRecord.STATE_INITIALIZED)
                throw new IllegalStateException("Mikrofon tidak dapat diinisialisasi");
            record = mic;
            int audioSession = mic.getAudioSessionId();
            if (AcousticEchoCanceler.isAvailable()) {
                echo = AcousticEchoCanceler.create(audioSession);
                if (echo != null) echo.setEnabled(true);
            }
            if (NoiseSuppressor.isAvailable()) {
                noise = NoiseSuppressor.create(audioSession);
                if (noise != null) noise.setEnabled(true);
            }
            mic.startRecording();
            short[] samples = new short[SAMPLES];
            List<String> pending = new ArrayList<>(3);
            while (running && !Thread.currentThread().isInterrupted()) {
                int read = 0;
                while (read < SAMPLES && running) {
                    int n = mic.read(samples, read, SAMPLES - read, AudioRecord.READ_BLOCKING);
                    if (n <= 0) throw new IllegalStateException("Mikrofon terhenti (" + n + ")");
                    read += n;
                }
                if (!running) break;
                double energy = 0;
                for (short sample : samples) energy += (double)sample * sample;
                double rms = Math.sqrt(energy / SAMPLES) / 32768.0;
                if (muted || rms < 0.012) { pending.clear(); continue; }
                byte[] raw = new byte[BYTES];
                for (int i = 0; i < SAMPLES; i++) {
                    raw[i * 2] = (byte)(samples[i] & 255);
                    raw[i * 2 + 1] = (byte)((samples[i] >>> 8) & 255);
                }
                pending.add(Base64.encodeToString(raw, Base64.NO_WRAP));
                if (pending.size() == 3) {
                    JSONObject batch = new JSONObject();
                    batch.put("t", "audioBatch");
                    JSONArray frames = new JSONArray();
                    for (String pcm : pending) frames.put(new JSONObject().put("pcm", pcm));
                    batch.put("frames", frames);
                    sender.send(batch.toString());
                    pending.clear();
                }
            }
        } catch (SecurityException | IllegalStateException | JSONException failure) {
            if (running) onFailure.fail(failure.getMessage());
        } finally {
            record = null;
            if (echo != null) echo.release();
            if (noise != null) noise.release();
            if (mic != null) {
                try { mic.stop(); } catch (RuntimeException ignored) {}
                mic.release();
            }
        }
    }
    void receive(JSONObject message) {
        if (!running || deafened) return;
        String uuid = message.optString("uuid", "");
        if (uuid.isEmpty()) return;
        JSONArray batch = message.optJSONArray("frames");
        if (batch == null && "audio".equals(message.optString("t"))) {
            batch = new JSONArray();
            batch.put(message);
        }
        if (batch == null || batch.length() < 1 || batch.length() > 4) return;
        double dx = message.optDouble("dx", 0), dy = message.optDouble("dy", 0);
        double dz = message.optDouble("dz", 0), yaw = Math.toRadians(message.optDouble("yaw", 0));
        double x = -(dx * Math.cos(yaw) + dz * Math.sin(yaw));
        double z = -(dz * Math.cos(yaw) - dx * Math.sin(yaw));
        double distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Approximate web's inverse-distance panner (native stereo instead of HRTF).
        double gain = distance <= 2 ? 1 : 1 / (1 + 1.3 * (distance - 2) / 2);
        double pan = Math.max(-1, Math.min(1, x / Math.max(1, Math.hypot(x, z))));
        float left = (float)(gain * Math.cos((pan + 1) * Math.PI / 4));
        float right = (float)(gain * Math.sin((pan + 1) * Math.PI / 4));
        synchronized (monitor) {
            Stream stream = incoming.computeIfAbsent(uuid, key -> new Stream());
            stream.lastArrival = System.nanoTime();
            for (int i = 0; i < batch.length(); i++) {
                JSONObject frame = batch.optJSONObject(i);
                if (frame == null) continue;
                try {
                    byte[] pcm = Base64.decode(frame.optString("pcm", ""), Base64.DEFAULT);
                    if (pcm.length != BYTES) continue;
                    if (stream.frames.size() >= 12) stream.frames.removeFirst();
                    stream.frames.add(new Frame(pcm, left, right));
                } catch (IllegalArgumentException ignored) { }
            }
        }
    }
    private void play() {
        AudioTrack speaker = null;
        try {
            int buffer = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_STEREO,
                AudioFormat.ENCODING_PCM_16BIT);
            if (buffer <= 0) throw new IllegalStateException("Speaker stereo 48kHz tidak didukung");
            speaker = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(new AudioFormat.Builder()
                    .setSampleRate(RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(Math.max(buffer, BYTES * 12)).build();
            if (speaker.getState() != AudioTrack.STATE_INITIALIZED)
                throw new IllegalStateException("Speaker gagal diinisialisasi");
            speaker.play();
            short[] output = new short[SAMPLES * 2];
            long next = System.nanoTime();
            while (running && !Thread.currentThread().isInterrupted()) {
                int[] mix = new int[SAMPLES * 2];
                synchronized (monitor) {
                    long now = System.nanoTime();
                    Iterator<Map.Entry<String, Stream>> iterator = incoming.entrySet().iterator();
                    while (iterator.hasNext()) {
                        Stream stream = iterator.next().getValue();
                        if (now - stream.lastArrival > 3_000_000_000L) {
                            iterator.remove(); continue;
                        }
                        if (!stream.primed && stream.frames.size() >= 2) stream.primed = true;
                        Frame frame = stream.primed ? stream.frames.pollFirst() : null;
                        if (frame == null) {
                            stream.primed = false; continue;
                        }
                        for (int i = 0; i < SAMPLES; i++) {
                            short sample = (short)((frame.pcm[2 * i] & 255) |
                                (frame.pcm[2 * i + 1] << 8));
                            mix[i * 2] += (int)(sample * frame.left);
                            mix[i * 2 + 1] += (int)(sample * frame.right);
                        }
                    }
                }
                if (deafened) {
                    for (int i = 0; i < output.length; i++) output[i] = 0;
                } else {
                    for (int i = 0; i < output.length; i++)
                        output[i] = (short)Math.max(-32768, Math.min(32767, mix[i]));
                }
                int n = speaker.write(output, 0, output.length, AudioTrack.WRITE_BLOCKING);
                if (n < 0) throw new IllegalStateException("Speaker terhenti (" + n + ")");
                next += 20_000_000L;
                long wait = next - System.nanoTime();
                if (wait > 0) LockSupport.parkNanos(wait);
                else next = System.nanoTime();
            }
        } catch (RuntimeException failure) {
            if (running) onFailure.fail(failure.getMessage());
        } finally {
            if (speaker != null) {
                try { speaker.pause(); speaker.flush(); speaker.stop(); }
                catch (RuntimeException ignored) { }
                speaker.release();
            }
        }
    }
}
