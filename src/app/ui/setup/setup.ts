import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatchHistoryService } from '../../game/match-history.service';
import { Card, PlayerCount } from '../../engine/card';
import { TargetScore } from '../../engine/match';
import { GameService } from '../../game/game.service';
import { PlayingCard } from '../playing-card/playing-card';

interface FormatOption {
  readonly playerCount: PlayerCount;
  readonly label: string;
  readonly hint: string;
}

/** Start screen: pick the format and target score, then start a match. */
@Component({
  selector: 'app-setup',
  imports: [PlayingCard, RouterLink],
  templateUrl: './setup.html',
  styleUrl: './setup.scss',
})
export class Setup {
  private readonly game = inject(GameService);
  private readonly router = inject(Router);
  protected readonly savedMatches = inject(MatchHistoryService).matches;

  /** The four manilhas, shown as a fan on the start screen. */
  protected readonly heroCards: readonly Card[] = [
    { rank: '7', suit: 'diamonds' },
    { rank: 'A', suit: 'spades' },
    { rank: '7', suit: 'hearts' },
    { rank: '4', suit: 'clubs' },
  ];

  protected readonly formats: readonly FormatOption[] = [
    { playerCount: 2, label: '1 x 1', hint: 'você contra o bot' },
    { playerCount: 4, label: '2 x 2', hint: 'você + parceiro bot' },
  ];
  protected readonly targets: readonly TargetScore[] = [12, 24];

  protected readonly playerCount = signal<PlayerCount>(2);
  protected readonly target = signal<TargetScore>(12);

  protected start(): void {
    this.game.startMatch({ targetScore: this.target(), playerCount: this.playerCount() });
    this.router.navigate(['/mesa']);
  }
}
