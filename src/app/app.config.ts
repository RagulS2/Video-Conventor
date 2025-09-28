import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { canEncodeAudio } from 'mediabunny';

const initializeMp3Encoder = () =>
  async () => {
    try {
      if (!(await canEncodeAudio('mp3'))) {
        const module = await import('@mediabunny/mp3-encoder');
        module.registerMp3Encoder();
        console.info('[Mediabunny] Registered bundled MP3 encoder extension.');
      } else {
        console.info('[Mediabunny] Native MP3 encoder detected; no extension needed.');
      }
    } catch (error) {
      console.warn('[Mediabunny] Unable to determine MP3 encoder availability.', error);
    }
  };

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeMp3Encoder,
      multi: true
    }
  ]
};
