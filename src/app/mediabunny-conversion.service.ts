import { Injectable } from '@angular/core';
import {
  ADTS,
  AdtsOutputFormat,
  BufferSource as MediabunnyBufferSource,
  BufferTarget,
  Conversion,
  ConversionAudioOptions,
  DiscardedTrack,
  FLAC,
  FlacOutputFormat,
  Input,
  MATROSKA,
  MP3 as MP3_CONTAINER,
  MP4,
  Mp3OutputFormat,
  OGG,
  OggOutputFormat,
  Output,
  QTFF,
  WAVE,
  WavOutputFormat,
  WEBM,
  canEncodeAudio
} from 'mediabunny';

export interface ConversionResult {
  fileName: string;
  blob: Blob;
  remoteUrl?: string;
  mimeType: string;
}

export type AudioOutputFormatId = 'mp3' | 'wav' | 'ogg' | 'aac' | 'flac';

export interface AudioOutputOption {
  id: AudioOutputFormatId;
  label: string;
  description: string;
  extension: string;
  supported?: boolean;
  reason?: string;
}

interface ProgressCallbacks {
  onProgress?: (ratio: number) => void;
  onLog?: (message: string) => void;
}

type AudioFormatSpec = {
  label: string;
  description: string;
  extension: string;
  mimeType: string;
  codec: 'mp3' | 'pcm-s16' | 'opus' | 'aac' | 'flac';
  alwaysAvailable?: boolean;
  unsupportedMessage?: string;
  createFormat: () => Mp3OutputFormat | WavOutputFormat | OggOutputFormat | AdtsOutputFormat | FlacOutputFormat;
  audioOptions: ConversionAudioOptions;
};

const AUDIO_FORMAT_SPECS: Record<AudioOutputFormatId, AudioFormatSpec> = {
  mp3: {
    label: 'MP3',
    description: 'Best compatibility and small file size.',
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    codec: 'mp3',
    alwaysAvailable: true,
    createFormat: () => new Mp3OutputFormat(),
    audioOptions: { codec: 'mp3', bitrate: 192_000 }
  },
  wav: {
    label: 'WAV',
    description: 'Uncompressed PCM for editing.',
    extension: '.wav',
    mimeType: 'audio/wav',
    codec: 'pcm-s16',
    alwaysAvailable: true,
    createFormat: () => new WavOutputFormat({ large: true }),
    audioOptions: { codec: 'pcm-s16', sampleRate: 48_000, numberOfChannels: 2 }
  },
  ogg: {
    label: 'OGG (Opus)',
    description: 'High quality streaming friendly files.',
    extension: '.ogg',
    mimeType: 'application/ogg',
    codec: 'opus',
    unsupportedMessage: 'This browser cannot encode Opus audio yet. Try Chrome 116+, Firefox 130+, or use MP3/WAV.',
    createFormat: () => new OggOutputFormat(),
    audioOptions: { codec: 'opus', bitrate: 128_000, sampleRate: 48_000 }
  },
  aac: {
    label: 'AAC',
    description: 'Great for iOS and Safari playback.',
    extension: '.aac',
    mimeType: 'audio/aac',
    codec: 'aac',
    unsupportedMessage: 'AAC encoding needs native WebCodecs support (Safari 17+, Chrome 120+ with flags).',
    createFormat: () => new AdtsOutputFormat(),
    audioOptions: { codec: 'aac', bitrate: 192_000 }
  },
  flac: {
    label: 'FLAC',
    description: 'Lossless compression with smaller size than WAV.',
    extension: '.flac',
    mimeType: 'audio/flac',
    codec: 'flac',
    unsupportedMessage: 'FLAC encoding is still experimental in WebCodecs. Use WAV for lossless audio in this browser.',
    createFormat: () => new FlacOutputFormat(),
    audioOptions: { codec: 'flac' }
  }
};

export const AUDIO_OUTPUT_OPTIONS: AudioOutputOption[] = Object.entries(AUDIO_FORMAT_SPECS).map(
  ([id, spec]) => ({
    id: id as AudioOutputFormatId,
    label: spec.label,
    description: spec.description,
    extension: spec.extension
  })
);

@Injectable({ providedIn: 'root' })
export class MediabunnyConversionService {
  private activeCancel?: () => void;
  private readonly supportChecks = new Map<AudioOutputFormatId, Promise<boolean>>();

  async convert(
    file: File,
    formatId: AudioOutputFormatId,
    callbacks?: ProgressCallbacks
  ): Promise<ConversionResult> {
    if (this.activeCancel) {
      throw new Error('Another conversion is already in progress.');
    }

    const spec = AUDIO_FORMAT_SPECS[formatId];
    if (!spec) {
      throw new Error(`Unsupported output format: ${formatId}`);
    }

    if (!(await this.isFormatSupported(formatId))) {
      const message = spec.unsupportedMessage
        ?? `${spec.label} encoding is not supported in this browser yet. Try MP3, WAV, or OGG instead.`;
      throw new Error(message);
    }

    callbacks?.onLog?.('Loading file into memory for Mediabunny analysis...');
    const inMemoryCopy = await file.arrayBuffer();

    const input = new Input({
      source: new MediabunnyBufferSource(inMemoryCopy),
      formats: [MP4, QTFF, MATROSKA, WEBM, WAVE, OGG, FLAC, MP3_CONTAINER, ADTS]
    });
    const target = new BufferTarget();
    const outputFormat = spec.createFormat();
    const output = new Output({
      format: outputFormat,
      target
    });

    let conversion: Conversion | null = null;
    let cancelRequested = false;
    let cancelReject: ((reason?: unknown) => void) | undefined;

    const cancelPromise = new Promise<never>((_, reject) => {
      cancelReject = reject;
    });

    const cancel = () => {
      if (cancelRequested) {
        return;
      }
      cancelRequested = true;
      callbacks?.onLog?.('Cancel requested. Stopping conversion...');
      if (conversion) {
        void conversion.cancel().catch(() => undefined);
      }
      if (cancelReject) {
        cancelReject(new DOMException('Conversion cancelled.', 'AbortError'));
        cancelReject = undefined;
      }
    };

    this.activeCancel = cancel;

    try {
      callbacks?.onProgress?.(0);
      callbacks?.onLog?.(`Loading "${file.name}" with Mediabunny...`);

      let detectedFormatName = 'unknown';
      try {
        const detectedFormat = await input.getFormat();
        detectedFormatName = detectedFormat?.name ?? detectedFormat?.constructor?.name ?? 'unknown';
        callbacks?.onLog?.(`Detected container: ${detectedFormatName}.`);
      } catch (formatError) {
        const headerBytes = Array.from(new Uint8Array(inMemoryCopy.slice(0, 32)))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(' ');
        callbacks?.onLog?.(
          `Unable to detect the container format from the file header. First 32 bytes: ${headerBytes}`
        );
        throw formatError;
      }

      conversion = await Conversion.init({
        input,
        output,
        video: { discard: true },
        audio: spec.audioOptions
      });

      if (!conversion.isValid) {
        if (conversion.discardedTracks.length === 0) {
          throw new Error('Mediabunny rejected the file: unrecognized or unsupported audio/video tracks.');
        }
        throw new Error(this.describeInvalidConversion(conversion));
      }

      if (cancelRequested) {
        cancel();
      }

      conversion.onProgress = (progress: number) => {
        if (cancelRequested) {
          return;
        }
        const clamped = Math.min(Math.max(progress, 0), 1);
        callbacks?.onProgress?.(clamped);
      };

      callbacks?.onLog?.('Transcoding audio to MP3 with Mediabunny...');

      await Promise.race([conversion.execute(), cancelPromise]);

      if (cancelRequested) {
        throw new DOMException('Conversion cancelled.', 'AbortError');
      }

      const buffer = target.buffer;
      if (!buffer) {
        throw new Error('Mediabunny did not return any audio bytes.');
      }

      const blob = new Blob([buffer], { type: spec.mimeType });
      target.buffer = null;

      callbacks?.onProgress?.(1);
      callbacks?.onLog?.('Conversion finished.');

      return {
        fileName: this.buildOutputName(file.name, spec.extension),
        blob,
        mimeType: spec.mimeType
      };
    } finally {
      this.activeCancel = undefined;
      input.dispose();
    }
  }

  cancelConversion(): void {
    this.activeCancel?.();
  }

  async getFormatOptionsWithSupport(): Promise<AudioOutputOption[]> {
    const options: AudioOutputOption[] = [];
    for (const option of AUDIO_OUTPUT_OPTIONS) {
      const spec = AUDIO_FORMAT_SPECS[option.id];
      const supported = await this.isFormatSupported(option.id);
      options.push({
        ...option,
        supported,
        reason: supported ? undefined : spec.unsupportedMessage ?? 'Not supported by this browser yet.'
      });
    }
    return options;
  }

  async isFormatSupported(formatId: AudioOutputFormatId): Promise<boolean> {
    const spec = AUDIO_FORMAT_SPECS[formatId];
    if (!spec) {
      return false;
    }

    if (spec.alwaysAvailable) {
      return true;
    }

    if (this.supportChecks.has(formatId)) {
      return this.supportChecks.get(formatId)!;
    }

    const promise = this.checkCodecSupport(spec.codec).catch(() => false);
    this.supportChecks.set(formatId, promise);
    return promise;
  }

  private async checkCodecSupport(codec: AudioFormatSpec['codec']): Promise<boolean> {
    if (codec === 'pcm-s16') {
      return true;
    }

    try {
      return await canEncodeAudio(codec);
    } catch {
      return false;
    }
  }

  private describeInvalidConversion(conversion: Conversion): string {
    if (!conversion.discardedTracks.length) {
      return 'Unable to convert this file with Mediabunny.';
    }

    const details = conversion.discardedTracks
      .map(({ track, reason }) => `${track.type} track discarded (${this.humanizeReason(reason)})`)
      .join('; ');

    return `Unable to convert this file: ${details}.`;
  }

  private humanizeReason(reason: DiscardedTrack['reason']): string {
    const mapping: Record<DiscardedTrack['reason'], string> = {
      discarded_by_user: 'discarded by configuration',
      max_track_count_reached: 'output format limit reached',
      max_track_count_of_type_reached: 'too many tracks of this type for the output format',
      unknown_source_codec: 'unknown source codec',
      undecodable_source_codec: 'source codec not decodable in this browser',
      no_encodable_target_codec: 'no compatible encoder available'
    };

    return mapping[reason] ?? 'unsupported track';
  }

  private buildOutputName(originalName: string, extension: string): string {
    const safeBase = this.sanitizeBaseName(originalName) || 'audio';
    return `${safeBase}${extension}`;
  }

  private sanitizeBaseName(name: string): string {
    return name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .slice(0, 64);
  }
}
