// WebCodecs & Custom Window Types

declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack });
  readable: ReadableStream<any>;
}

declare class VideoEncoder {
  static isConfigSupported(config: any): Promise<{ supported: boolean; config?: any }>;
  constructor(init: { output: (chunk: any, metadata?: any) => void; error: (err: any) => void });
  state: string;
  encodeQueueSize: number;
  configure(config: any): void;
  encode(frame: any, options?: any): void;
  close(): void;
}

declare class VideoFrame {
  constructor(image: any, init?: any);
  displayWidth: number;
  displayHeight: number;
  timestamp: number;
  codedWidth?: number;
  codedHeight?: number;
  close(): void;
}

declare class EncodedVideoChunk {
  constructor(init: { type: 'key' | 'delta'; timestamp: number; data: BufferSource });
  type: 'key' | 'delta';
  timestamp: number;
  byteLength: number;
  copyTo(destination: BufferSource): void;
}

declare class AudioDecoder {
  static isConfigSupported(config: any): Promise<{ supported: boolean }>;
  constructor(init: { output: (data: any) => void; error: (err: any) => void });
  state: string;
  configure(config: any): void;
  decode(chunk: any): void;
  close(): void;
}

declare class EncodedAudioChunk {
  constructor(init: { type: 'key' | 'delta'; timestamp: number; data: BufferSource });
}

interface Window {
  MediaStreamTrackProcessor?: typeof MediaStreamTrackProcessor;
  VideoEncoder?: typeof VideoEncoder;
  AudioDecoder?: typeof AudioDecoder;
  AudioContext?: typeof AudioContext;
}

interface MediaTrackSupportedConstraints {
  restrictOwnAudio?: boolean;
}

interface MediaTrackConstraints {
  restrictOwnAudio?: boolean;
}
