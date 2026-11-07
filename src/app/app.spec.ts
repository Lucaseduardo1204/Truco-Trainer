import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { playBotMatch } from './bot/testing';
import { MatchConfig } from './engine/match';
import { analyzeMatch } from './feedback/report';
import { GameService } from './game/game.service';
import { MatchHistoryService } from './game/match-history.service';

describe('App routes', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
  });

  it('/ shows the start screen', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.querySelector('.start')).not.toBeNull();
  });

  it('/mesa without a match goes back to /', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/mesa');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('/mesa shows the table once a match starts, with 3 cards in hand', async () => {
    TestBed.inject(GameService).startMatch({ targetScore: 12, playerCount: 2 }, 1);
    const harness = await RouterTestingHarness.create('/mesa');
    const page = harness.routeNativeElement!;
    expect(page.querySelectorAll('.my-hand .hand-card')).toHaveLength(3);
    expect(page.querySelectorAll('.arena .fan')).toHaveLength(1);
  });

  it('the 📊 button opens the live statistics panel', async () => {
    TestBed.inject(GameService).startMatch({ targetScore: 12, playerCount: 2 }, 2);
    const harness = await RouterTestingHarness.create('/mesa');
    const page = harness.routeNativeElement!;
    expect(page.querySelector('.stats-panel')).toBeNull();

    (page.querySelector('.stats-toggle') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(page.querySelector('.stats-panel')).not.toBeNull();
  });

  it('/laboratorio: pick 3 cards and see each option simulated; a table card moves you to 2nd', async () => {
    const harness = await RouterTestingHarness.create('/laboratorio');
    const page = harness.routeNativeElement!;
    const deckCards = Array.from(page.querySelectorAll<HTMLButtonElement>('.deck-card'));
    expect(deckCards).toHaveLength(27);

    deckCards.slice(0, 3).forEach((button) => button.click());
    harness.detectChanges();
    expect(page.querySelectorAll('.results li').length).toBe(4); // 3 cards + truco

    (page.querySelectorAll('.pile')[1] as HTMLElement).click(); // now picking "na mesa"
    deckCards[10].click();
    harness.detectChanges();
    expect(page.querySelector('.position')?.textContent).toContain('2º');
  });

  it('2x2 shows three other seats around the table', async () => {
    TestBed.inject(GameService).startMatch({ targetScore: 12, playerCount: 4 }, 1);
    const harness = await RouterTestingHarness.create('/mesa');
    const page = harness.routeNativeElement!;
    expect(page.querySelectorAll('.arena .fan')).toHaveLength(3);
    expect(page.querySelector('.seat.ally[data-pos=top] .name')?.textContent).toContain('Parceiro');
  });

  describe('with a saved match', () => {
    const config: MatchConfig = { playerCount: 2, targetScore: 12, seed: 51 };
    const played = playBotMatch(config);

    it('/relatorio/:id shows its analysis', async () => {
      const saved = TestBed.inject(MatchHistoryService).save(config, played.history, 0);
      const harness = await RouterTestingHarness.create(`/relatorio/${saved.id}`);
      const page = harness.routeNativeElement!;
      expect(page.querySelector('h1')?.textContent).toContain(played.winner === 0 ? 'Vitória' : 'Derrota');
      expect(page.querySelector('.metric strong')?.textContent).toContain(`${saved.summary.quality}%`);
    });

    it('"Baixar PDF" opens every card section, names the file and prints, then restores', async () => {
      const saved = TestBed.inject(MatchHistoryService).save(config, played.history, 0);
      const harness = await RouterTestingHarness.create(`/relatorio/${saved.id}`);
      const page = harness.routeNativeElement!;
      const details = Array.from(page.querySelectorAll('details'));

      let duringPrint: { open: boolean[]; title: string } | null = null;
      const print = vi.spyOn(window, 'print').mockImplementation(() => {
        duringPrint = { open: details.map((d) => d.open), title: document.title };
      });

      (page.querySelector('.pdf') as HTMLButtonElement).click();

      expect(print).toHaveBeenCalledTimes(1);
      expect(duringPrint!.open.every((open) => open)).toBe(true);
      expect(duringPrint!.title).toBe(`truco-trainer-analise-${saved.playedAt.slice(0, 10)}`);
      expect(details.every((d) => !d.open)).toBe(true);
      print.mockRestore();
    });

    it('a key moment can be simulated: one row marked "você", one marked best', async () => {
      // A bot match with at least one key moment.
      let seed = 51;
      let withMoments = playBotMatch({ ...config, seed });
      while (analyzeMatch({ ...config, seed }, withMoments.history, 0).moments.length === 0) {
        seed++;
        withMoments = playBotMatch({ ...config, seed });
      }
      const saved = TestBed.inject(MatchHistoryService).save({ ...config, seed }, withMoments.history, 0);
      const harness = await RouterTestingHarness.create(`/relatorio/${saved.id}`);
      const page = harness.routeNativeElement!;

      (page.querySelector('.simulate') as HTMLButtonElement).click();
      harness.detectChanges();

      const rows = page.querySelectorAll('.simulation li');
      expect(rows.length).toBeGreaterThan(0);
      expect(page.querySelectorAll('.simulation li.chosen')).toHaveLength(1);
      expect(page.querySelectorAll('.simulation li.best')).toHaveLength(1);
    });

    it('/relatorio with an unknown id says so', async () => {
      const harness = await RouterTestingHarness.create('/relatorio/nope');
      expect(harness.routeNativeElement?.querySelector('.missing')).not.toBeNull();
    });

    it('/historico lists saved matches and draws the 4 evolution charts', async () => {
      const history = TestBed.inject(MatchHistoryService);
      history.save(config, played.history, 0);
      history.save(config, played.history, 0);
      const harness = await RouterTestingHarness.create('/historico');
      const page = harness.routeNativeElement!;
      expect(page.querySelectorAll('.row')).toHaveLength(2);
      expect(page.querySelectorAll('app-line-chart')).toHaveLength(2);
      expect(page.querySelectorAll('app-stacked-bar-chart')).toHaveLength(2);
    });

    it('"Só no seco" leaves out matches played with the 📊 panel', async () => {
      const history = TestBed.inject(MatchHistoryService);
      history.save(config, played.history, 0, false);
      history.save(config, played.history, 0, true);
      const harness = await RouterTestingHarness.create('/historico');
      const page = harness.routeNativeElement!;
      expect(page.querySelectorAll('.row')).toHaveLength(2);

      const dry = [...page.querySelectorAll<HTMLButtonElement>('.filters button')].find((b) =>
        b.textContent?.includes('Só no seco'),
      )!;
      dry.click();
      harness.detectChanges();
      expect(page.querySelectorAll('.row')).toHaveLength(1);
    });
  });
});
