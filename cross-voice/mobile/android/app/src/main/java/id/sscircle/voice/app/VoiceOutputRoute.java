package id.sscircle.voice.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

/**
 * Local device audio routing only. It does not send a control event to Cloudflare.
 * User preference contains NO pairing code, token, or secret.
 */
final class VoiceOutputRoute {
    private static final String PREF_FILE = "sscircle-voice-audio";
    private static final String SPEAKER_KEY = "speaker_enabled";
    private VoiceOutputRoute() {}

    static boolean isSpeaker(Context context) {
        return context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
            .getBoolean(SPEAKER_KEY, true);
    }

    static void save(Context context, boolean speaker) {
        context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
            .edit().putBoolean(SPEAKER_KEY, speaker).apply();
    }

    static boolean apply(Context context, boolean speaker) {
        AudioManager manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) return false;
        try {
            manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= 31) {
                int type = speaker
                    ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
                for (AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
                    if (device.getType() == type) {
                        return manager.setCommunicationDevice(device);
                    }
                }
                // Some tablets do not have an earpiece at all.
                return false;
            }
            // API 26-30: Android's supported legacy voice-call route switch.
            manager.setSpeakerphoneOn(speaker);
            return manager.isSpeakerphoneOn() == speaker;
        } catch (RuntimeException unavailable) {
            return false;
        }
    }

    static void release(Context context, int previousMode, boolean previousSpeaker) {
        AudioManager manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 31) manager.clearCommunicationDevice();
            else manager.setSpeakerphoneOn(previousSpeaker);
            manager.setMode(previousMode);
        } catch (RuntimeException ignored) {
            // If a different app took audio ownership, the OS owns its route.
        }
    }
}
