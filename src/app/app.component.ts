import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FeatureHighlightsComponent } from './components/feature-highlights/feature-highlights.component';
import { FaqSectionComponent } from './components/faq-section/faq-section.component';
import { HeroSectionComponent } from './components/hero-section/hero-section.component';
import { PageFooterComponent } from './components/page-footer/page-footer.component';
import { StepsSectionComponent } from './components/steps-section/steps-section.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeroSectionComponent,
    StepsSectionComponent,
    FeatureHighlightsComponent,
    FaqSectionComponent,
    PageFooterComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {}
