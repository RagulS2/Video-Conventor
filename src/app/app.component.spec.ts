import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { MediabunnyConversionService } from './mediabunny-conversion.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: MediabunnyConversionService,
          useValue: {
            convert: () =>
              Promise.resolve({
                fileName: 'demo.mp3',
                blob: new Blob(),
                remoteUrl: 'https://cdn.example/demo.mp3'
              }),
            cancelConversion: () => undefined
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
