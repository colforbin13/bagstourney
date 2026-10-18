// src/app/bracket/blind-draw-generator.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BlindDrawGeneratorComponent } from './blind-draw-generator.component';
import { AuthService } from '../shared/services/auth.service';

describe('BlindDrawGeneratorComponent', () => {
  let fixture: ComponentFixture<BlindDrawGeneratorComponent>;
  let el: HTMLElement;

  function setup(loggedIn = false) {
    TestBed.configureTestingModule({
      imports: [BlindDrawGeneratorComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } }],
    });
    fixture = TestBed.createComponent(BlindDrawGeneratorComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  function type(text: string) {
    const area = el.querySelector('textarea')!;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  const button = () => el.querySelector<HTMLButtonElement>('.actions .btn-primary')!;
  const status = () => el.querySelector('.status')!.textContent!.trim();

  it('should not draw until there are at least four players', () => {
    setup();
    expect(button().disabled).toBe(true);
    type('Ann\nBob');
    expect(status()).toContain('Add at least 4');
    expect(button().disabled).toBe(true);
  });

  it('should refuse an odd number of players', () => {
    setup();
    type('Ann\nBob\nCara\nDev\nEd');
    expect(status()).toContain('odd number');
    expect(button().disabled).toBe(true);
  });

  it('should count teams and skip repeated names', () => {
    setup();
    type('Ann\nBob\nCara\nDev\nann');
    expect(status()).toBe('4 players make 2 teams. (1 repeated name skipped)');
    expect(button().disabled).toBe(false);
  });

  it('should draw every player onto exactly one team and show the bracket', () => {
    setup();
    const names = ['Ann', 'Bob', 'Cara', 'Dev', 'Eve', 'Finn'];
    type(names.join('\n'));
    button().click();
    fixture.detectChanges();

    const teams = Array.from(el.querySelectorAll('.teams li')).map(li => li.textContent!);
    expect(teams.length).toBe(3);
    const drawn = teams.join(' ');
    names.forEach(n => expect(drawn.split(n).length - 1).toBe(1));
    // Three teams round up to a four-team bracket: seed 1 has the bye.
    expect(Array.from(el.querySelectorAll('.round h3')).map(h => h.textContent)).toEqual(['Semifinals', 'Final']);
    expect(el.querySelectorAll('.match.bye').length).toBe(1);
    expect(button().textContent!.trim()).toBe('Draw again');
  });

  it('should pair every A with a B in a balanced draw', () => {
    setup();
    el.querySelector<HTMLInputElement>('.advanced input[type=checkbox]')!.click();
    fixture.detectChanges();
    type('A1\nA2\nA3');
    const areaB = el.querySelector<HTMLTextAreaElement>('#names-b')!;
    areaB.value = 'B1\nB2\nB3\na1';
    areaB.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(status()).toBe('6 players make 3 teams. 3 A, 3 B. (1 repeated name skipped)');

    button().click();
    fixture.detectChanges();
    const teams = Array.from(el.querySelectorAll('.teams li')).map(li => li.textContent!);
    expect(teams.length).toBe(3);
    teams.forEach(t => expect(t).toMatch(/A\d & B\d/));
  });

  it('should say when a balanced split is uneven', () => {
    setup();
    el.querySelector<HTMLInputElement>('.advanced input[type=checkbox]')!.click();
    fixture.detectChanges();
    type('A1\nA2\nA3\nA4');
    const areaB = el.querySelector<HTMLTextAreaElement>('#names-b')!;
    areaB.value = 'B1\nB2';
    areaB.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(status()).toContain('The 2 extra A players will be paired with each other.');
  });

  it('should not have drawn anything before a click, so the prerendered page is empty of results', () => {
    setup();
    type('Ann\nBob\nCara\nDev');
    expect(el.querySelector('.teams')).toBeNull();
  });

  it('should send signed-out visitors to sign up and organizers to their dashboard', () => {
    setup(false);
    expect(el.querySelector('.live a')!.getAttribute('href')).toBe('/admin/register');
    TestBed.resetTestingModule();
    setup(true);
    expect(el.querySelector('.live a')!.getAttribute('href')).toBe('/admin');
  });
});
