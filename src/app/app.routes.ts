import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { GameService } from './game/game.service';
import { History } from './ui/history/history';
import { Report } from './ui/report/report';
import { Setup } from './ui/setup/setup';
import { Table } from './ui/table/table';

export const routes: Routes = [
  { path: '', component: Setup, title: 'Truco Trainer' },
  {
    path: 'mesa',
    component: Table,
    title: 'Mesa · Truco Trainer',
    // Guard: without a match (e.g. after a page reload) there is no table to show.
    canActivate: [() => (inject(GameService).match() ? true : inject(Router).createUrlTree(['/']))],
  },
  // `:id` reaches the Report component as an input (withComponentInputBinding).
  { path: 'relatorio/:id', component: Report, title: 'Análise · Truco Trainer' },
  { path: 'historico', component: History, title: 'Histórico · Truco Trainer' },
  { path: '**', redirectTo: '' },
];
