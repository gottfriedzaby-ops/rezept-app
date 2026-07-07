"use client";

import { useTranslations } from "next-intl";
import type { InteractionMetrics } from "@/lib/admin-metrics";
import { Stat } from "./AdminDashboard";

const intFmt = new Intl.NumberFormat("de-DE");
const perUserFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
const pctFmt = new Intl.NumberFormat("de-DE", {
  style: "percent",
  maximumFractionDigits: 1,
});

interface InteractionAnalyticsProps {
  data: InteractionMetrics;
}

export default function InteractionAnalytics({ data }: InteractionAnalyticsProps) {
  const t = useTranslations("Admin");

  const header = (
    <div>
      <h3 className="font-serif text-xl font-medium text-ink-primary">
        {t("interactionTitle")}
      </h3>
      <p className="mt-1 text-sm text-ink-secondary">{t("interactionSubtitle")}</p>
    </div>
  );

  // Empty state — still surface the heading so the section is discoverable.
  if (data.totals.totalEvents === 0) {
    return (
      <section className="space-y-6">
        {header}
        <p className="text-sm text-ink-tertiary">{t("noEvents")}</p>
      </section>
    );
  }

  const chartMax = Math.max(1, ...data.timeSeries.map((d) => d.count));
  const funnels = [
    { key: "import", label: t("funnelImport"), result: data.funnels.import },
    { key: "cook", label: t("funnelCook"), result: data.funnels.cook },
  ];

  return (
    <section className="space-y-8">
      {header}

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label={t("totalEvents")} value={intFmt.format(data.totals.totalEvents)} />
        <Stat
          label={t("activeUsersEvents")}
          value={intFmt.format(data.totals.activeUsers)}
        />
        <Stat
          label={t("eventsPerUser")}
          value={perUserFmt.format(data.totals.eventsPerUser)}
        />
      </div>

      {/* Activity over time */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
          {t("activityOverTime")}
        </h4>
        {data.timeSeries.length === 0 ? (
          <p className="text-sm text-ink-tertiary">{t("noEvents")}</p>
        ) : (
          <>
            <div
              role="img"
              aria-label={t("activityOverTime")}
              className="flex items-end gap-0.5 h-40 rounded-xl border border-border-secondary p-3"
            >
              {data.timeSeries.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 bg-forest/80 rounded-t min-h-[2px]"
                  style={{ height: `${(d.count / chartMax) * 100}%` }}
                  title={`${dateFmt.format(new Date(d.date))}: ${intFmt.format(d.count)}`}
                  aria-label={`${dateFmt.format(new Date(d.date))}: ${intFmt.format(d.count)}`}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-ink-tertiary">
              <span>{dateFmt.format(new Date(data.timeSeries[0].date))}</span>
              <span>{t("chartMaxLabel", { value: intFmt.format(chartMax) })}</span>
              <span>
                {dateFmt.format(
                  new Date(data.timeSeries[data.timeSeries.length - 1].date),
                )}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Funnels */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
          {t("funnelsTitle")}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {funnels.map(({ key, label, result }) => {
            const first = result.steps[0]?.count ?? 0;
            return (
              <div
                key={key}
                className="rounded-xl border border-border-secondary p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-ink-primary">{label}</p>
                  <p className="text-xs text-ink-tertiary">
                    {t("conversionRate")}:{" "}
                    <span className="text-ink-secondary">
                      {result.conversionPct === null
                        ? "—"
                        : pctFmt.format(result.conversionPct / 100)}
                    </span>
                  </p>
                </div>
                <div className="space-y-2">
                  {result.steps.map((step) => {
                    const width = first > 0 ? (step.count / first) * 100 : 0;
                    return (
                      <div
                        key={step.key}
                        className="relative h-8 overflow-hidden rounded bg-surface-secondary"
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded bg-forest/15"
                          style={{ width: `${width}%` }}
                        />
                        <div className="relative flex h-full items-center justify-between px-3 text-sm">
                          <span className="text-ink-primary">
                            {t(`funnelStep.${step.key}`)}
                          </span>
                          <span className="text-ink-secondary">
                            {intFmt.format(step.count)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Events by name & category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border-secondary p-5">
          <p className="text-xs text-ink-tertiary mb-3">{t("eventsByName")}</p>
          <ul className="space-y-1.5 text-sm">
            {data.byName.map((row) => (
              <li key={row.name} className="flex justify-between">
                <span className="text-ink-primary">{t(`eventName.${row.name}`)}</span>
                <span className="text-ink-secondary">
                  {intFmt.format(row.count)}{" "}
                  <span className="text-ink-tertiary">
                    ({row.percentage.toFixed(1)}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border-secondary p-5">
          <p className="text-xs text-ink-tertiary mb-3">{t("eventsByCategory")}</p>
          <ul className="space-y-1.5 text-sm">
            {data.byCategory.map((row) => (
              <li key={row.category} className="flex justify-between">
                <span className="text-ink-primary">
                  {t(`category.${row.category}`)}
                </span>
                <span className="text-ink-secondary">
                  {intFmt.format(row.count)}{" "}
                  <span className="text-ink-tertiary">
                    ({row.percentage.toFixed(1)}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Top pages */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
          {t("topPages")}
        </h4>
        {data.topPages.length === 0 ? (
          <p className="text-sm text-ink-tertiary">{t("noEvents")}</p>
        ) : (
          <div className="rounded-xl border border-border-secondary overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-xs uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("colPath")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("colViews")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topPages.map((row) => (
                  <tr key={row.path} className="border-t border-border-secondary">
                    <td className="px-4 py-2 text-ink-primary font-mono text-xs">
                      {row.path}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {intFmt.format(row.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
