import { Injectable } from '@angular/core';
import {
  ADTS,
  BufferSource as MediabunnyBufferSource,
  BufferTarget,
  Conversion,
  DiscardedTrack,
  FLAC,
  Input,
  MATROSKA,
  MP3 as MP3_CONTAINER,
  MP4,
  Mp3OutputFormat,
  OGG,
  Output,
  QTFF,
  WAVE,
  WEBM
} from 'mediabunny';

export interface ConversionResult {
  fileName: string;
  blob: Blob;
  remoteUrl?: string;
}

interface ProgressCallbacks {
  onProgress?: (ratio: number) => void;
  onLog?: (message: string) => void;
}

@Injectable({ providedIn: 'root' })
export class MediabunnyConversionService {
  private activeCancel?: () => void;

  async convert(file: File, callbacks?: ProgressCallbacks): Promise<ConversionResult> {
    if (this.activeCancel) {
      throw new Error('Another conversion is already in progress.');
    }

    callbacks?.onLog?.('Loading file into memory for Mediabunny analysis...');
    const inMemoryCopy = await file.arrayBuffer();

    const input = new Input({
      source: new MediabunnyBufferSource(inMemoryCopy),
      formats: [MP4, QTFF, MATROSKA, WEBM, WAVE, OGG, FLAC, MP3_CONTAINER, ADTS]
    });
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp3OutputFormat(),
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
        audio: { codec: 'mp3', bitrate: 192_000 }
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

      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      target.buffer = null;

      callbacks?.onProgress?.(1);
      callbacks?.onLog?.('Conversion finished.');

      return {
        fileName: this.buildOutputName(file.name),
        blob
      };
    } finally {
      this.activeCancel = undefined;
      input.dispose();
    }
  }

  cancelConversion(): void {
    this.activeCancel?.();
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

  private buildOutputName(originalName: string): string {
    const safeBase = this.sanitizeBaseName(originalName) || 'audio';
    return `${safeBase}.mp3`;
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
