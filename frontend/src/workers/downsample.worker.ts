/// <reference lib="webworker" />
export {};

interface DownsampleRequest {
  points: { t: number; v: number }[];
  maxPoints: number;
}

/** Largest-Triangle-Three-Buckets style downsampler. */
function lttb(data: { t: number; v: number }[], threshold: number) {
  if (threshold >= data.length || threshold <= 2) return data;

  const sampled: { t: number; v: number }[] = [];
  const bucketSize = (data.length - 2) / (threshold - 2);
  let a = 0;

  sampled.push(data[0]);

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length);

    let avgT = 0;
    let avgV = 0;
    const avgCount = rangeEnd - rangeStart || 1;
    for (let j = rangeStart; j < rangeEnd; j++) {
      avgT += data[j].t;
      avgV += data[j].v;
    }
    avgT /= avgCount;
    avgV /= avgCount;

    const rangeOffs = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    const pointA = data[a];
    let maxArea = -1;
    let maxIdx = rangeOffs;

    for (let j = rangeOffs; j < rangeTo; j++) {
      const area = Math.abs(
        (pointA.t - avgT) * (data[j].v - pointA.v) -
          (pointA.t - data[j].t) * (avgV - pointA.v)
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[maxIdx]);
    a = maxIdx;
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

self.onmessage = (e: MessageEvent<DownsampleRequest>) => {
  const { points, maxPoints } = e.data;
  const result = lttb(points, maxPoints);
  (self as unknown as Worker).postMessage({ points: result });
};