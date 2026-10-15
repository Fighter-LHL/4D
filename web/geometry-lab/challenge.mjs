import { SINGLE, TRANSFER, PREDICTIONS, sliceAtDial, classifyChange } from './geometry.mjs';

export const TRIALS = Object.freeze([
  { body: SINGLE, from: 0.04, to: 0.28, chapter: '找到物体', prompt: '向右移动这一片，会发生什么？' },
  { body: SINGLE, from: 0.28, to: 0.5, chapter: '接近中心', prompt: '继续向右，截面会怎样变化？' },
  { body: SINGLE, from: 0.5, to: 0.76, chapter: '穿过中心', prompt: '越过刚才的位置，再预测一次。' },
  { body: SINGLE, from: 0.76, to: 0.96, chapter: '离开物体', prompt: '继续向右，这个截面会留下来吗？' },
  { body: SINGLE, from: 0.3, to: 0.7, chapter: '换一个位置', prompt: '只比较起点与终点，截面大小会怎样？' },
  { body: TRANSFER, from: 0.48, to: 0.61, chapter: '换一个物体', prompt: '这个超球偏向 W 轴右侧。向右移动后呢？' },
].map(Object.freeze));

export class PredictionSession {
  constructor(trials = TRIALS) {
    if (!trials.length) throw new RangeError('A session needs at least one trial');
    this.trials = trials;
    this.index = 0;
    this.records = [];
    this.state = 'predict';
  }

  get trial() { return this.trials[this.index]; }
  get score() { return this.records.filter((record) => record.correct).length; }

  submit(choice) {
    if (this.state !== 'predict') throw new Error('This trial has already been answered');
    if (!Object.hasOwn(PREDICTIONS, choice)) throw new RangeError('Unknown prediction');
    const { body, from, to } = this.trial;
    const answer = classifyChange(sliceAtDial(body, from), sliceAtDial(body, to));
    const record = Object.freeze({
      trial: this.index + 1,
      body: { id: body.id, center: [...body.center], radius: body.radius },
      from, to, choice, answer, correct: choice === answer,
    });
    this.records.push(record);
    this.state = 'result';
    return record;
  }

  next() {
    if (this.state !== 'result') throw new Error('Answer the current trial first');
    if (this.index === this.trials.length - 1) {
      this.state = 'complete';
      return false;
    }
    this.index += 1;
    this.state = 'predict';
    return true;
  }

  toJSON() {
    return {
      schemaVersion: 1,
      experiment: 'four-d-geometry-lab',
      stage: 'browser-prediction-practice',
      completed: this.state === 'complete',
      score: this.score,
      answered: this.records.length,
      total: this.trials.length,
      trials: this.records,
    };
  }
}
