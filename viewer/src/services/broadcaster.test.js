// @vitest-environment jsdom
/**
 * Broadcaster pipeline unit tests with browser mocks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBroadcaster,
  sourceUnavailable,
  supportError,
  listMicrophones,
} from './broadcaster.js';

function queue() {
  const ready = [];
  const waiting = [];
  let closed = false;

  return {
    reader: {
      read() {
        if (ready.length) return Promise.resolve({ done: false, value: ready.shift() });
        if (closed) return Promise.resolve({ done: true });
        return new Promise((resolve) => waiting.push(resolve));
      },
      cancel() {
        closed = true;
        waiting.splice(0).forEach((resolve) => resolve({ done: true }));
        return Promise.resolve();
      },
    },
    push(val) {
      const next = waiting.shift();
      if (next) next({ done: false, value: val });
      else ready.push(val);
    },
  };
}

class FakeTrack {
  constructor(kind, settings = {}) {
    this.kind = kind;
    this.settings = settings;
    this.stopped = false;
    this.listeners = {};
    this.constraints = null;
  }
  getSettings() {
    return this.settings;
  }
  addEventListener(event, listener) {
    (this.listeners[event] ??= []).push(listener);
  }
  dispatch(event) {
    (this.listeners[event] ?? []).forEach((listener) => listener());
  }
  applyConstraints(constraints) {
    this.constraints = constraints;
    return Promise.resolve();
  }
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  constructor(video, audio = null) {
    this.video = video ? [video] : [];
    this.audio = audio ? [audio] : [];
  }
  getVideoTracks() {
    return [...this.video];
  }
  getAudioTracks() {
    return [...this.audio];
  }
  getTracks() {
    return [...this.video, ...this.audio];
  }
  removeTrack(track) {
    this.audio = this.audio.filter((a) => a !== track);
    this.video = this.video.filter((v) => v !== track);
  }
}

const frame = (displayWidth = 1280, displayHeight = 720, timestamp = 1000) => ({
  displayWidth,
  displayHeight,
  timestamp,
  closed: false,
  close() {
    this.closed = true;
  },
});

class FakeVideoEncoder {
  static supportedCodecs = ['avc1.42E01E', 'vp8', 'vp09.00.10.08'];

  static isConfigSupported(config) {
    const ok = FakeVideoEncoder.supportedCodecs.includes(config.codec);
    return Promise.resolve({ supported: ok, config });
  }

  constructor({ output, error }) {
    this.output = output;
    this.error = error;
    this.state = 'unconfigured';
    this.config = null;
    this.encodes = [];
    this.encodeQueueSize = 0;
  }

  configure(config) {
    this.state = 'configured';
    this.config = config;
  }

  encode(frame, opts = {}) {
    this.encodes.push({ frame, opts });
    this.output(
      {
        type: opts.keyFrame ? 'key' : 'delta',
        timestamp: frame.timestamp,
        byteLength: 10,
        copyTo(dst) {
          dst.fill(1);
        },
      },
      this.encodes.length === 1 ? { decoderConfig: { codec: this.config.codec } } : {},
    );
  }

  close() {
    this.state = 'closed';
  }
}

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = {};
    setTimeout(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatch('open');
    }, 0);
  }

  addEventListener(event, listener) {
    (this.listeners[event] ??= []).push(listener);
  }

  dispatch(event, payload = {}) {
    (this.listeners[event] ?? []).forEach((l) => l(payload));
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close');
  }
}

describe('broadcaster shared tests', () => {
  beforeEach(() => {
    vi.stubGlobal('VideoEncoder', FakeVideoEncoder);
    vi.stubGlobal('VideoFrame', class {});
    vi.stubGlobal('EncodedVideoChunk', class {});
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('supportError', () => {
    it('does not complain in a complete browser environment', () => {
      expect(supportError()).toBeNull();
    });

    it('points out missing WebCodecs', () => {
      vi.stubGlobal('VideoEncoder', undefined);
      expect(supportError()).toMatch(/WebCodecs/);
    });
  });

  describe('sourceUnavailable', () => {
    it('returns null when mediaDevices is fully supported', () => {
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia: () => {}, getUserMedia: () => {} },
      });
      expect(sourceUnavailable('screen')).toBeNull();
      expect(sourceUnavailable('camera')).toBeNull();
    });
  });
});
