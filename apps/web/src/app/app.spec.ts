import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  it('renders the Donovan heading inside the main landmark', async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const main: HTMLElement = fixture.nativeElement.querySelector('main');
    expect(main.querySelector('h1')?.textContent).toBe('Donovan');
  });
});
