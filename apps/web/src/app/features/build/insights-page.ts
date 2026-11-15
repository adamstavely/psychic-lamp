import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Insights, Kpi, Share } from '@donovan/contracts';
import { buildAreaFor } from '../../shell/areas';

/** Insights: the workspace's usage over the last 30 days, counted from what's stored. */
@Component({
  selector: 'dn-insights-page',
  imports: [RouterLink],
  templateUrl: './insights-page.html',
  styleUrls: ['./detail.css', './insights-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightsPage {
  protected readonly insights = httpResource<Insights>(() => '/api/insights');
  readonly #day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  readonly #number = new Intl.NumberFormat();

  protected readonly period = computed(() => {
    if (!this.insights.hasValue()) return '';
    const i = this.insights.value();
    return `${this.#day.format(new Date(i.from))} to ${this.#day.format(new Date(i.to))}`;
  });

  protected count(n: number): string {
    return this.#number.format(n);
  }
  /** A figure against the 30 days before, in words: up or down by how much, or the same. */
  protected change(k: Kpi): { text: string; trend: 'up' | 'down' | 'flat' } | null {
    if (k.previous === null) return null;
    const than = 'the 30 days before';
    if (k.value === k.previous) return { text: `Same as ${than}`, trend: 'flat' };
    if (k.previous === 0) return { text: `Up from none in ${than}`, trend: 'up' };
    const pct = Math.round((Math.abs(k.value - k.previous) / k.previous) * 100);
    const by = pct ? `${pct}%` : 'under 1%';
    return k.value > k.previous
      ? { text: `Up ${by} on ${than}`, trend: 'up' }
      : { text: `Down ${by} on ${than}`, trend: 'down' };
  }
  protected percent(s: Share): string {
    return `${Math.round(s.share * 100)}% · ${this.#number.format(s.count)}`;
  }
  /** The bars are out of the busiest one, so it fills the row. */
  protected max(rows: Share[]): number {
    return Math.max(1, ...rows.map((r) => r.count));
  }
  protected link(kind: Insights['installs'][number]['kind'], id: string): string[] {
    return [buildAreaFor(kind).path, id];
  }
}
