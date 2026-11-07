import { TestBed } from '@angular/core/testing';
import { LineChart } from './line-chart';
import { StackedBarChart } from './stacked-bar-chart';

describe('StackedBarChart', () => {
  function render(rows: number[][]) {
    const fixture = TestBed.createComponent(StackedBarChart);
    fixture.componentRef.setInput('categories', [
      { name: 'A', color: 'red' },
      { name: 'B', color: 'blue' },
    ]);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('labels', rows.map((_, i) => `Partida ${i + 1}`));
    fixture.componentRef.setInput('ariaLabel', 'teste');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws one segment per non-zero value, nothing for an empty column', () => {
    const page = render([
      [2, 1],
      [0, 0],
      [0, 3],
    ]);
    expect(page.querySelectorAll('g path')).toHaveLength(3);
  });

  it('has a legend and a focusable hit area per column; focus shows the tooltip with every category', () => {
    const page = render([[2, 1]]);
    expect(page.querySelectorAll('.legend li')).toHaveLength(2);
    const hit = page.querySelector('.hit') as SVGRectElement;
    hit.dispatchEvent(new FocusEvent('focus'));
    TestBed.tick();
    expect(page.querySelector('.tooltip')?.textContent).toContain('total 3');
    expect(page.querySelectorAll('.tooltip-row')).toHaveLength(2);
  });
});

describe('LineChart', () => {
  function render(series: { name: string; style: 'line' | 'dots'; values: number[] }[]) {
    const fixture = TestBed.createComponent(LineChart);
    fixture.componentRef.setInput('series', series.map((s) => ({ ...s, color: 'red' })));
    fixture.componentRef.setInput('labels', series[0].values.map((_, i) => `Partida ${i + 1}`));
    fixture.componentRef.setInput('ariaLabel', 'teste');
    fixture.componentRef.setInput('unit', '%');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('one series: a line with an end dot, and no legend box (the card title names it)', () => {
    const page = render([{ name: 'Win rate', style: 'line', values: [50, 60, 70] }]);
    expect(page.querySelectorAll('path.line')).toHaveLength(1);
    expect(page.querySelectorAll('circle.dot')).toHaveLength(1);
    expect(page.querySelector('.legend')).toBeNull();
  });

  it('two series: dots for each value plus the trend line, with a legend', () => {
    const page = render([
      { name: 'Nota', style: 'dots', values: [40, 80, 60] },
      { name: 'Tendência', style: 'line', values: [40, 60, 60] },
    ]);
    expect(page.querySelectorAll('circle.dot')).toHaveLength(3 + 1);
    expect(page.querySelectorAll('.legend li')).toHaveLength(2);
  });

  it('hovering a match shows a crosshair and every series value there', () => {
    const page = render([
      { name: 'Nota', style: 'dots', values: [40, 80] },
      { name: 'Tendência', style: 'line', values: [40, 60] },
    ]);
    (page.querySelectorAll('.hit')[1] as SVGRectElement).dispatchEvent(new PointerEvent('pointerenter'));
    TestBed.tick();
    expect(page.querySelector('.crosshair')).not.toBeNull();
    expect(page.querySelector('.tooltip')?.textContent).toContain('80%');
    expect(page.querySelector('.tooltip')?.textContent).toContain('60%');
  });
});
