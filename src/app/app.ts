import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Just a frame: the router decides which screen goes in the outlet. */
@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
