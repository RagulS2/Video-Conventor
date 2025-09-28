import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-faq-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './faq-section.component.html',
  styleUrl: './faq-section.component.scss'
})
export class FaqSectionComponent {
  readonly faqs: FaqItem[] = [
    {
      question: 'Does it leave any trace?',
      answer:
        'Media is read into memory solely for the duration of the conversion and never sent to a server. Close the tab and the buffers are gone.'
    },
    {
      question: 'Why do I need the full download?',
      answer:
        'Mediabunny inspects raw bytes to understand codecs and stream layouts. Streaming URLs or embedded players won’t work—grab the actual file instead.'
    },
    {
      question: 'What about giant files?',
      answer:
        'Browser memory is the main limit. For multi-gigabyte source files, trim them first or use a desktop workflow to stay responsive.'
    }
  ];
}
