// src/app/bracket/bags-scorekeeper.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { BagsScorekeeperComponent, STORAGE_KEY } from './bags-scorekeeper.component';
import { AuthService } from '../shared/services/auth.service';

describe('BagsScorekeeperComponent', () => {
  let fixture: ComponentFixture<BagsScorekeeperComponent>;
  let el: HTMLElement;

  function setup(platform = 'browser') {
    TestBed.configureTestingModule({
      imports: [BagsScorekeeperComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isLoggedIn: () => false } },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    fixture = TestBed.createComponent(BagsScorekeeperComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  const scores = () => [...el.querySelectorAll('.score')].map(s => Number(s.textContent));
  const plus = (side: number, kind: 'in' | 'on') =>
    el.querySelectorAll<HTMLButtonElement>('.side')[side].querySelectorAll<HTMLButtonElement>('.step')[kind === 'in' ? 1 : 3];
  const minus = (side: number, kind: 'in' | 'on') =>
    el.querySelectorAll<HTMLButtonElement>('.side')[side].querySelectorAll<HTMLButtonElement>('.step')[kind === 'in' ? 0 : 2];
  const count = (side: number, kind: 'in' | 'on') => Number(el.querySelector(`[data-testid="count-${side}-${kind}"]`)!.textContent);
  const click = (b: HTMLElement) => { b.click(); fixture.detectChanges(); };
  const scoreButton = () => el.querySelector<HTMLButtonElement>('.score-round')!;
  const buttonNamed = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim().startsWith(text))!;

  /** Taps in a round: first team's in/on, then the second team's, then scores it. */
  function play(aIn: number, aOn: number, bIn: number, bOn: number) {
    for (let i = 0; i < aIn; i++) click(plus(0, 'in'));
    for (let i = 0; i < aOn; i++) click(plus(0, 'on'));
    for (let i = 0; i < bIn; i++) click(plus(1, 'in'));
    for (let i = 0; i < bOn; i++) click(plus(1, 'on'));
    click(scoreButton());
  }

  it('scores a round with cancellation by default', () => {
    setup();
    click(plus(0, 'in'));
    click(plus(0, 'in'));
    click(plus(0, 'on'));
    click(plus(1, 'in'));
    click(plus(1, 'on'));
    expect(el.querySelector('.preview')!.textContent).toContain('Team 1 scores 3 (7 to 4)');
    click(scoreButton());
    expect(scores()).toEqual([3, 0]);
    expect(count(0, 'in')).toBe(0);
    expect(scoreButton().textContent).toContain('Score round 2');
  });

  it('stops counting at four bags a side', () => {
    setup();
    for (let i = 0; i < 3; i++) click(plus(0, 'in'));
    click(plus(0, 'on'));
    expect(plus(0, 'in').disabled).toBeTrue();
    expect(plus(0, 'on').disabled).toBeTrue();
    expect(minus(0, 'in').disabled).toBeFalse();
    expect(plus(1, 'in').disabled).toBeFalse();
  });

  it('undoes the last round and puts its bags back to fix', () => {
    setup();
    play(2, 0, 0, 0);
    play(0, 0, 1, 1);
    expect(scores()).toEqual([6, 4]);
    click(buttonNamed('Undo'));
    expect(scores()).toEqual([6, 0]);
    expect(count(1, 'in')).toBe(1);
    expect(count(1, 'on')).toBe(1);
  });

  it('shows the winner, and a new game keeps the team names', () => {
    setup();
    const name = el.querySelector<HTMLInputElement>('.name')!;
    name.value = 'Red';
    name.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    play(4, 0, 0, 0);
    play(3, 0, 0, 0);
    expect(el.querySelector('.winner')!.textContent).toContain('Red wins, 21 to 0');
    expect(el.querySelector('.score-round')).toBeNull();
    click(buttonNamed('New game'));
    expect(scores()).toEqual([0, 0]);
    expect(el.querySelector<HTMLInputElement>('.name')!.value).toBe('Red');
  });

  it('puts an emptied team name back to its default', () => {
    setup();
    const name = el.querySelectorAll<HTMLInputElement>('.name')[1];
    name.value = '   ';
    name.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(name.value).toBe('Team 2');
  });

  it('locks the settings once the first round is scored', () => {
    setup();
    expect(el.querySelector('.settings fieldset')).not.toBeNull();
    play(1, 0, 0, 0);
    expect(el.querySelector('.settings fieldset')).toBeNull();
    expect(el.querySelector('.locked')!.textContent).toContain('Cancellation scoring to 21, going over wins');
  });

  it('plays straight scoring with a bust rule when chosen', () => {
    setup();
    click(el.querySelectorAll<HTMLInputElement>('input[name="mode"]')[1]);
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = 'previous';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    play(4, 0, 2, 0);
    expect(scores()).toEqual([12, 6]);
    play(4, 0, 0, 0); // 24: busts back to 12
    expect(scores()).toEqual([12, 6]);
    expect(el.querySelector('.history tbody tr td:nth-child(2) .detail')!.textContent).toContain('bust');
  });

  it('switches a 15 bust off of a target it no longer fits under', () => {
    setup();
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = '15';
    select.dispatchEvent(new Event('change'));
    const target = el.querySelector<HTMLInputElement>('.target')!;
    target.value = '11';
    target.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.settings()).toEqual({ mode: 'cancellation', target: 11, bust: 'previous' });
  });

  it('needs a second tap to clear a game in progress', () => {
    setup();
    play(1, 0, 0, 0);
    click(buttonNamed('New game'));
    expect(scores()).toEqual([3, 0]);
    click(buttonNamed('Tap again'));
    expect(scores()).toEqual([0, 0]);
  });

  it('keeps the game through a reload', () => {
    setup();
    play(2, 0, 0, 1);
    TestBed.resetTestingModule();
    setup();
    expect(scores()).toEqual([5, 0]);
    expect(el.querySelectorAll('.history tbody tr').length).toBe(1);
  });

  it('starts fresh from a corrupt or invalid stored game', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    setup();
    expect(scores()).toEqual([0, 0]);
    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 1, settings: { mode: 'cancellation', target: 21, bust: 'off' }, names: ['A', 'B'],
      rounds: [[{ in: 9, on: 0 }, { in: 0, on: 0 }]],
    }));
    setup();
    expect(scores()).toEqual([0, 0]);
    expect(el.querySelector<HTMLInputElement>('.name')!.value).toBe('Team 1');
  });

  it('leaves storage alone while prerendering', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 1, settings: { mode: 'cancellation', target: 21, bust: 'off' }, names: ['A', 'B'],
      rounds: [[{ in: 1, on: 0 }, { in: 0, on: 0 }]],
    }));
    const before = localStorage.getItem(STORAGE_KEY);
    setup('server');
    expect(scores()).toEqual([0, 0]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('carries the rules for search engines in the page itself', () => {
    setup();
    expect(el.textContent).toContain('A bag in the hole is worth 3 points');
    expect(el.querySelector('a.btn-primary')!.getAttribute('href')).toBe('/admin/register');
  });
});
