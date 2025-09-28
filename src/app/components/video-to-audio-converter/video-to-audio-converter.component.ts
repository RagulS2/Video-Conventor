import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import {
  AudioOutputFormatId,
  MediabunnyConversionService,
  ConversionResult,
  AudioOutputOption
} from '../../mediabunny-conversion.service';

@Component({
  selector: 'app-video-to-audio-converter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-to-audio-converter.component.html',
  styleUrl: './video-to-audio-converter.component.scss',
  host: {
    class: 'converter-card'
  }
})
export class VideoToAudioConverterComponent implements OnDestroy, OnInit {
  readonly formatOptions = signal<AudioOutputOption[]>([]);
  readonly selectedFormatId = signal<AudioOutputFormatId>('mp3');
  readonly currentFormat = computed(
    () => this.formatOptions().find((option) => option.id === this.selectedFormatId()) ?? this.formatOptions()[0]
  );
  readonly optionsLoaded = signal(false);
  readonly unsupportedNotice = computed(() => {
    const format = this.currentFormat();
    if (!format) {
      return null;
    }
    return format.supported ? null : format.reason ?? 'This format is not supported in your browser yet.';
  });

  readonly selectedFile = signal<File | null>(null);
  readonly isConverting = signal(false);
  readonly progress = signal(0);
  readonly status = signal('Drop a video to start converting locally.');
  readonly errorMessage = signal<string | null>(null);
  readonly downloadUrl = signal<SafeUrl | null>(null);
  readonly outputFileName = signal<string | null>(null);
  readonly logs = signal<string[]>([]);
  readonly isDragOver = signal(false);

  private objectUrl: string | null = null;

  constructor(
    private readonly conversionService: MediabunnyConversionService,
    private readonly sanitizer: DomSanitizer
  ) {}

  ngOnDestroy(): void {
    this.revokeObjectUrl();
  }

  async ngOnInit(): Promise<void> {
    await this.refreshFormatOptions();
  }

  onFormatChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }

    const value = select.value as AudioOutputFormatId;
    if (this.selectedFormatId() !== value) {
      this.selectedFormatId.set(value);
      this.resetConversionState();
      const file = this.selectedFile();
      if (file) {
        this.status.set(`Ready to convert "${file.name}" to ${this.currentFormat().label}.`);
      }
      if (this.currentFormat() && this.currentFormat()?.supported === false) {
        this.errorMessage.set(this.currentFormat()?.reason ?? 'Selected format is not available in this browser.');
      }
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0) ?? null;
    if (file) {
      this.handleIncomingFile(file);
    }
    if (input) {
      input.value = '';
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);

    const file = event.dataTransfer?.files?.item(0) ?? null;
    if (file) {
      this.handleIncomingFile(file);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  clearSelection(): void {
    if (this.isConverting()) {
      return;
    }
    this.selectedFile.set(null);
    this.status.set('Drop a new file to start another conversion.');
    this.resetConversionState();
  }

  async convertSelected(): Promise<void> {
    if (this.isConverting()) {
      return;
    }

    if (!this.optionsLoaded()) {
      this.errorMessage.set('Preparing available output formats. Try again in a second.');
      return;
    }

    const file = this.selectedFile();
    if (!file) {
      this.errorMessage.set('Please choose a video file before starting the conversion.');
      return;
    }

    const selectedFormat = this.currentFormat();
    if (!selectedFormat || selectedFormat.supported === false) {
      this.errorMessage.set(selectedFormat?.reason ?? 'This format is not available in this browser.');
      return;
    }

    const formatId = this.selectedFormatId();
    const formatLabel = this.currentFormat().label;

    this.isConverting.set(true);
    this.errorMessage.set(null);
    this.progress.set(0);
    this.status.set(`Preparing to convert to ${formatLabel}...`);
    this.logs.set([]);

    try {
      const result = await this.conversionService.convert(file, formatId, {
        onProgress: (ratio) => {
          const percent = Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
          this.progress.set(percent);
          if (percent >= 100) {
            this.status.set('Finalizing the audio file...');
          } else {
            this.status.set(`Converting to ${formatLabel} — ${percent}%`);
          }
        },
        onLog: (message) => {
          this.logs.update((current) => {
            const next = [...current, message];
            return next.slice(-40);
          });
        }
      });

      this.status.set(`${formatLabel} ready. Time to download!`);
      this.progress.set(100);
      this.setDownloadResult(result);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.status.set('Conversion cancelled.');
      } else {
        let message = error instanceof Error ? error.message : 'Unexpected error during conversion.';
        if (typeof message === 'string' && message.toLowerCase().includes('unsupported or unrecognizable format')) {
          message =
            'We could not detect any supported audio/video streams in this file. Make sure you selected the actual media file and that the container is MP4, MOV, WebM, MKV, WAV, OGG, FLAC, MP3, or ADTS.';
        }
        this.errorMessage.set(message);
        this.status.set('Conversion failed.');
      }
    } finally {
      this.isConverting.set(false);
    }
  }

  cancelConversion(): void {
    if (!this.isConverting()) {
      return;
    }
    this.conversionService.cancelConversion();
    this.status.set('Cancelling conversion...');
  }

  formatBytes(bytes: number): string {
    if (!bytes) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  formatLabel(): string {
    return this.currentFormat()?.label ?? 'audio';
  }

  private async refreshFormatOptions(): Promise<void> {
    const options = await this.conversionService.getFormatOptionsWithSupport();
    this.formatOptions.set(options);
    this.optionsLoaded.set(true);

    const hasSupportedSelection = options.some((option) => option.id === this.selectedFormatId() && option.supported);
    if (!hasSupportedSelection) {
      const fallback = options.find((option) => option.supported);
      if (fallback) {
        this.selectedFormatId.set(fallback.id);
        const file = this.selectedFile();
        if (file) {
          this.status.set(`Ready to convert "${file.name}" to ${fallback.label}.`);
        }
      } else {
        this.errorMessage.set('No compatible audio encoders were detected in this browser.');
        this.status.set('Try a different browser—no local audio encoders available.');
      }
    }
  }

  private handleIncomingFile(file: File): void {
    if (!this.isSupportedFile(file)) {
      this.errorMessage.set('Please choose a video or audio file.');
      return;
    }

    if (this.isConverting()) {
      this.cancelConversion();
    }

    this.resetConversionState();
    this.selectedFile.set(file);
    this.status.set(`Ready to convert "${file.name}" to ${this.formatLabel()}.`);
    this.errorMessage.set(null);
  }

  private isSupportedFile(file: File): boolean {
    const type = file.type.toLowerCase();
    return (
      type.startsWith('video/') ||
      type.startsWith('audio/') ||
      /\.(mp4|m4v|mkv|mov|webm|avi|flv|wmv|mp3|wav|m4a|aac|flac|ogg)$/i.test(file.name)
    );
  }

  private resetConversionState(): void {
    this.revokeObjectUrl();
    this.progress.set(0);
    this.logs.set([]);
    this.downloadUrl.set(null);
    this.outputFileName.set(null);
    this.errorMessage.set(null);
  }

  private setDownloadResult(result: ConversionResult): void {
    this.revokeObjectUrl();
    this.outputFileName.set(result.fileName);

    if (result.remoteUrl) {
      this.downloadUrl.set(result.remoteUrl);
      return;
    }

    const blobUrl = URL.createObjectURL(result.blob);
    this.objectUrl = blobUrl;
    this.downloadUrl.set(this.sanitizer.bypassSecurityTrustUrl(blobUrl));
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
