export function buildHtmlSubtitleCueIndex(cues) {
  const list = Array.isArray(cues) ? cues : [];
  const order = [];
  for (let index = 0; index < list.length; index += 1) {
    const cue = list[index];
    if (!cue) continue;
    const start = Number(cue.start);
    const end = Number(cue.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    order.push(index);
  }
  order.sort((left, right) => Number(list[left].start) - Number(list[right].start) || left - right);
  const starts = new Array(order.length);
  let maxDurationSeconds = 0;
  for (let position = 0; position < order.length; position += 1) {
    const cue = list[order[position]];
    const start = Number(cue.start);
    starts[position] = start;
    const duration = Number(cue.end) - start;
    if (duration > maxDurationSeconds) {
      maxDurationSeconds = duration;
    }
  }
  return { cues: list, order, starts, maxDurationSeconds };
}

export function findActiveHtmlSubtitleCues(index, timeSeconds) {
  const time = Number(timeSeconds);
  if (!index || !Array.isArray(index.order) || !index.order.length || !Number.isFinite(time)) {
    return { activeCues: [], nextBoundarySeconds: Infinity };
  }
  const { cues, order, starts, maxDurationSeconds } = index;
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle] <= time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const upper = low;
  let nextBoundarySeconds = upper < starts.length ? starts[upper] : Infinity;
  const earliestStart = time - maxDurationSeconds;
  const activeIndices = [];
  for (
    let position = upper - 1;
    position >= 0 && starts[position] >= earliestStart;
    position -= 1
  ) {
    const cueIndex = order[position];
    const end = Number(cues[cueIndex].end);
    if (time < end) {
      activeIndices.push(cueIndex);
      if (end < nextBoundarySeconds) {
        nextBoundarySeconds = end;
      }
    }
  }
  activeIndices.sort((left, right) => left - right);
  return {
    activeCues: activeIndices.map((cueIndex) => cues[cueIndex]),
    nextBoundarySeconds
  };
}
