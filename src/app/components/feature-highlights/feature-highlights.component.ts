import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-feature-highlights',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './feature-highlights.component.html',
  styleUrl: './feature-highlights.component.scss'
})
export class FeatureHighlightsComponent {
  readonly highlights = [
    {
      title: 'Private by design',
      description:
        'Everything runs on-device, so sensitive calls stay off the internet. Close the tab and every temporary byte is gone.'
    },
    {
      title: 'Built for speed',
      description:
        'The first run fetches codecs; afterwards, conversions fly. Even hour-long recordings feel instant.'
    },
    {
      title: 'Smart compatibility',
      description:
        'Automatic fallbacks ensure browsers without native encoders load just the bits they need—no manual installs.'
    },
    {
      title: 'Detailed telemetry',
      description:
        'Real-time logs highlight what’s happening—file analysis, encoding stages, download readiness, and more.'
    }
  ];
}
