import { AutoClass } from "@prisma/client";
import { clamp, median } from "@/lib/utils";

export interface Metrics {
  reach: number;
  views: number;
  likes: number;
  leads: number;
  followerGain: number;
}

export const METRIC_WEIGHTS = {
  reach: 0.25,
  views: 0.25,
  likes: 0.2,
  leads: 0.2,
  followerGain: 0.1,
} as const;

export function buildBaseline(metricsHistory: Metrics[]) {
  return {
    reach: metricMedian(metricsHistory, "reach"),
    views: metricMedian(metricsHistory, "views"),
    likes: metricMedian(metricsHistory, "likes"),
    leads: metricMedian(metricsHistory, "leads"),
    followerGain: metricMedian(metricsHistory, "followerGain"),
  };
}

export function computeAutoScore(current: Metrics, historical: Metrics[]) {
  const baseline = buildBaseline(historical);

  const weightedScore =
    scoreRatio(current.reach, baseline.reach) * METRIC_WEIGHTS.reach +
    scoreRatio(current.views, baseline.views) * METRIC_WEIGHTS.views +
    scoreRatio(current.likes, baseline.likes) * METRIC_WEIGHTS.likes +
    scoreRatio(current.leads, baseline.leads) * METRIC_WEIGHTS.leads +
    scoreRatio(current.followerGain, baseline.followerGain) * METRIC_WEIGHTS.followerGain;

  const rounded = Number(weightedScore.toFixed(2));

  return {
    score: rounded,
    autoClass: classifyScore(rounded),
    baseline,
  };
}

export function classifyScore(score: number) {
  if (score < 0.85) {
    return AutoClass.WEAK;
  }

  if (score > 1.15) {
    return AutoClass.STRONG;
  }

  return AutoClass.NORMAL;
}

function metricMedian(metricsHistory: Metrics[], key: keyof Metrics) {
  const values = metricsHistory.map((metrics) => metrics[key]).filter((value) => value >= 0);
  return median(values);
}

function scoreRatio(current: number, baseline: number) {
  if (baseline <= 0) {
    return 1;
  }

  return clamp(current / baseline, 0, 2);
}
