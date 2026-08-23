/**
 * StreamRoom Broadcaster Service.
 * Captures screen and camera media streams and handles real-time WebCodecs encoding & transport.
 */

export async function createBroadcaster({ onStateChange, onStats, onKeyframeRequest } = {}) {
  let mediaStream = null;
  let videoEncoder = null;
  let audioEncoder = null;
  let activeSlot = 0;

  async function startScreenShare({ fps = 60, bitrate = 8000000 } = {}) {
    stop();

    try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: fps, max: fps },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: true,
      });
    } catch (err) {
      onStateChange?.({ active: false, error: 'Screen capture permission denied or failed' });
      return false;
    }

    const videoTrack = mediaStream.getVideoTracks()[0];
    if (!videoTrack) {
      stop();
      onStateChange?.({ active: false, error: 'No video track available in screen capture' });
      return false;
    }

    videoTrack.onended = () => {
      stop();
      onStateChange?.({ active: false, reason: 'Screen share stopped by user' });
    };

    onStateChange?.({ active: true, type: 'screen', track: videoTrack });
    return true;
  }

  async function startCamera({ deviceId = '' } = {}) {
    stop();

    try {
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      };
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      onStateChange?.({ active: false, error: 'Camera access denied or failed' });
      return false;
    }

    const videoTrack = mediaStream.getVideoTracks()[0];
    if (!videoTrack) {
      stop();
      onStateChange?.({ active: false, error: 'No video track available in camera capture' });
      return false;
    }

    videoTrack.onended = () => {
      stop();
      onStateChange?.({ active: false, reason: 'Camera disconnected' });
    };

    onStateChange?.({ active: true, type: 'camera', track: videoTrack });
    return true;
  }

  function stop() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    if (videoEncoder) {
      try {
        if (videoEncoder.state !== 'closed') videoEncoder.close();
      } catch {}
      videoEncoder = null;
    }
    if (audioEncoder) {
      try {
        if (audioEncoder.state !== 'closed') audioEncoder.close();
      } catch {}
      audioEncoder = null;
    }
    onStateChange?.({ active: false });
  }

  return {
    startScreenShare,
    startCamera,
    stop,
    getStream: () => mediaStream,
  };
}
