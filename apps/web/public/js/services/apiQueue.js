/**
 * apiQueue.js - Token‑bucket rate limited fetch queue (60 req/min default)
 */
const DEFAULT_RATE = 60;  // per minute
const RETRY_DELAY_MS = 15 * 1000;

class ApiQueue {
  constructor(ratePerMin = DEFAULT_RATE) {
    this.capacity = ratePerMin;
    this.tokens = ratePerMin;
    this.queue = [];
    setInterval(() => this._refill(), 1000);
  }
  _refill() {
    if (this.tokens < this.capacity) this.tokens++;
    this._process();
  }
  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._process();
    });
  }
  _process() {
    if (!this.queue.length || this.tokens <= 0) return;
    const task = this.queue.shift();
    this.tokens--;
    (async () => {
      try {
        const res = await task.fn();
        task.resolve(res);
      } catch (err) {
        if (err?.status === 429 || err?.response?.status === 429) {
          // Rate limited, requeue
          setTimeout(() => this.enqueue(task.fn).then(task.resolve).catch(task.reject), RETRY_DELAY_MS);
        } else {
          task.reject(err);
        }
      }
      // Continue processing subsequent tasks in case we still have tokens
      this._process();
    })();
  }
}

export const apiQueue = new ApiQueue();