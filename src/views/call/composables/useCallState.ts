import { ref } from 'vue';

/**
 * Shared reactive state and actions for both private and group calls.
 * Inject callService actions (hangup, acceptCall, toggleMute, toggleVideo)
 * via the returned handlers once the real service is ready.
 */
export function useCallState() {
    const isConnected = ref(false);
    const isMuted = ref(false);
    const isVideoEnabled = ref(false);
    const formattedDuration = ref('00:00');

    let _durationTimer: ReturnType<typeof setInterval> | null = null;
    let _durationSeconds = 0;

    const startDurationTimer = () => {
        if (_durationTimer) return;
        _durationSeconds = 0;
        _durationTimer = setInterval(() => {
            _durationSeconds++;
            const m = Math.floor(_durationSeconds / 60).toString().padStart(2, '0');
            const s = (_durationSeconds % 60).toString().padStart(2, '0');
            formattedDuration.value = `${m}:${s}`;
        }, 1000);
    };

    const stopDurationTimer = () => {
        if (_durationTimer) {
            clearInterval(_durationTimer);
            _durationTimer = null;
        }
        formattedDuration.value = '00:00';
        _durationSeconds = 0;
    };

    const toggleMute = () => {
        isMuted.value = !isMuted.value;
        // TODO: callService.setMicEnabled(!isMuted.value)
    };

    const toggleVideo = () => {
        isVideoEnabled.value = !isVideoEnabled.value;
        // TODO: callService.setCameraEnabled(isVideoEnabled.value)
    };

    const hangup = () => {
        stopDurationTimer();
        isConnected.value = false;
        // TODO: callService.hangup()
    };

    const acceptCall = () => {
        isConnected.value = true;
        startDurationTimer();
        // TODO: callService.acceptCall()
    };

    return {
        isConnected,
        isMuted,
        isVideoEnabled,
        formattedDuration,
        toggleMute,
        toggleVideo,
        hangup,
        acceptCall,
        startDurationTimer,
        stopDurationTimer,
    };
}
