// src/app/bracket/poster.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { PosterComponent } from './poster.component';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';

describe('PosterComponent', () => {
  let component: PosterComponent;
  let fixture: ComponentFixture<PosterComponent>;
  let httpMock: HttpTestingController;

  const uuid = 'abc-123-def';
  const tournament = {
    id: 7, uuid, name: 'Backyard Classic', status: 'active',
    visibility: 'public', seeding_mode: 'automatic', team_entry_mode: 'auto_draft',
    created_at: '2026-01-01', paid_override: false,
  };

  // Pushed to by the variant-switching test, standing in for a navigation to the same
  // route with a different :kind.
  let params$: BehaviorSubject<ParamMap>;

  async function setup(params: Record<string, string>) {
    TestBed.resetTestingModule();
    params$ = new BehaviorSubject<ParamMap>(convertToParamMap(params));
    await TestBed.configureTestingModule({
      imports: [PosterComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        Router,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap(params) },
            paramMap: params$.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PosterComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    // Nothing should ever actually open a print dialog during a test run.
    spyOn(window, 'print');
    fixture.detectChanges();
  }

  function resolve() {
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/${uuid}`).flush(tournament);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should create and load the tournament by uuid', async () => {
    await setup({ uuid });
    resolve();

    expect(component).toBeTruthy();
    expect(component.tournament()!.name).toBe('Backyard Classic');
    expect(component.loading()).toBe(false);
  });

  it('should default to the bracket sign when no kind is given', async () => {
    await setup({ uuid });
    resolve();

    expect(component.kind()).toBe('bracket');
    expect(component.url()).toContain(`bracket/${uuid}`);
    expect(component.headline()).toContain('watch the bracket');
    expect(component.subhead()).toContain('No sign-up needed');
  });

  it('should build the sign-up sign when asked for it', async () => {
    await setup({ uuid, kind: 'register' });
    resolve();

    expect(component.kind()).toBe('register');
    expect(component.url()).toContain(`register/${uuid}`);
    expect(component.headline()).toContain('join this tournament');
    expect(component.eyebrow()).toBe('Sign up to play');
  });

  it('should treat an unrecognised kind as the bracket sign', async () => {
    await setup({ uuid, kind: 'nonsense' });
    resolve();
    expect(component.kind()).toBe('bracket');
  });

  it('should link from the bracket sign across to the sign-up one', async () => {
    await setup({ uuid });
    resolve();
    expect(component.otherKindLink()).toEqual(['/poster', uuid, 'register']);
  });

  it('should link from the sign-up sign back to the bracket one', async () => {
    await setup({ uuid, kind: 'register' });
    resolve();
    expect(component.otherKindLink()).toEqual(['/poster', uuid, 'bracket']);
  });

  it('should render the tournament name and the URL on the sign', async () => {
    await setup({ uuid });
    resolve();

    const text: string = fixture.nativeElement.querySelector('.poster').textContent;
    expect(text).toContain('Backyard Classic');
    expect(fixture.nativeElement.querySelector('.poster-url').textContent).toContain(`bracket/${uuid}`);
  });

  it('should keep the controls out of the printed output', async () => {
    await setup({ uuid });
    resolve();

    // .no-print is hidden by a global print media query; what matters here is that the
    // controls carry the marker and the sign itself does not.
    expect(fixture.nativeElement.querySelector('.poster-controls').classList).toContain('no-print');
    expect(fixture.nativeElement.querySelector('.poster').classList).not.toContain('no-print');
  });

  it('should report a bad uuid without calling the API', async () => {
    await setup({ uuid: '' });

    httpMock.expectNone(r => r.url.includes('/tournaments/by-uuid/'));
    expect(component.loadError()).toBe('This link is invalid.');
    expect(component.loading()).toBe(false);
  });

  it('should report a uuid that does not resolve', async () => {
    await setup({ uuid });
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/${uuid}`)
      .flush({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(component.loadError()).toBe('Tournament not found.');
    expect(fixture.nativeElement.querySelector('.poster')).toBeNull();
  });

  // Regression: switching signs navigates to the same route with a different :kind, so
  // Angular reuses the component and ngOnInit never fires again. Reading the snapshot
  // once left the page stuck on whichever sign you first landed on.
  it('should switch the whole sign when the kind changes without a fresh component', async () => {
    await setup({ uuid });
    resolve();
    expect(component.kind()).toBe('bracket');

    params$.next(convertToParamMap({ uuid, kind: 'register' }));
    fixture.detectChanges();

    expect(component.kind()).toBe('register');
    expect(component.url()).toContain(`register/${uuid}`);
    expect(component.eyebrow()).toBe('Sign up to play');
    expect(fixture.nativeElement.querySelector('.poster-headline').textContent).toContain('join this tournament');
    expect(fixture.nativeElement.querySelector('.poster-url').textContent).toContain(`register/${uuid}`);
    // Same tournament, so it must not refetch.
    httpMock.expectNone(`${environment.apiUrl}/tournaments/by-uuid/${uuid}`);
  });

  it('should switch back again', async () => {
    await setup({ uuid, kind: 'register' });
    resolve();

    params$.next(convertToParamMap({ uuid, kind: 'bracket' }));
    fixture.detectChanges();

    expect(component.kind()).toBe('bracket');
    expect(fixture.nativeElement.querySelector('.poster-url').textContent).toContain(`bracket/${uuid}`);
  });

  it('should refetch when the uuid itself changes', async () => {
    await setup({ uuid });
    resolve();

    const other = 'other-uuid';
    params$.next(convertToParamMap({ uuid: other, kind: 'bracket' }));
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/${other}`)
      .flush({ ...tournament, uuid: other, name: 'Other Tournament' });
    fixture.detectChanges();

    expect(component.tournament()!.name).toBe('Other Tournament');
    expect(component.url()).toContain(`bracket/${other}`);
  });

  it('should print on demand', async () => {
    await setup({ uuid });
    resolve();

    component.print();
    expect(window.print).toHaveBeenCalled();
  });
});
