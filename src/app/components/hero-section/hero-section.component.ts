import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { VideoToAudioConverterComponent } from '../video-to-audio-converter/video-to-audio-converter.component';

@Component({
  selector: 'app-hero-section',
  standalone: true,
  imports: [CommonModule, VideoToAudioConverterComponent],
  templateUrl: './hero-section.component.html',
  styleUrl: './hero-section.component.scss'
})
export class HeroSectionComponent {}
