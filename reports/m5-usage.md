# M5 usage scan

Static scan for `M5.behavior`, `M5.fifo`, `M5_1`, `M5_2` under `apps/web`.

| File | Line | Expression | R/W | Context |
| --- | --- | --- | --- | --- |
| scripts/verify-fifo.ts | 72 | `M5_1 = round2(split.trade)` | write | export
| scripts/verify-fifo.ts | 73 | `M5_2 = round2(split.fifo)` | write | export
| scripts/verify-fifo.ts | 75 | `M6 = round2(M4 + M3 + M5_2)` | read | script
| scripts/verify-history.ts | 41 | `res.M5_2` | read | script
| scripts/replay.ts | 51 | `m.M5.fifo` | read | replay
| scripts/verify-golden.ts | 40-43 | `res.M5_1`, `res.M5_2` | read | test
| scripts/verify-m5-overflow.ts | 18,23-24 | `res.M5_1`, `res.M5_2` | read | test
| app/lib/runAll.ts | 124-136 | `M5_1_override`, `M5_2_override` | write | calc
| app/lib/__tests__/runAll-golden.test.ts | 26-27 | `res.M5_1`, `res.M5_2` | read | test
| app/lib/__tests__/property-invariants.test.ts | 68 | `res.M5_2` | read | test
| app/lib/__tests__/property-metrics.test.ts | 60,64 | `split.fifo`, `result.M5_2` | read | test
| app/lib/__tests__/e2e-m5-consistency.test.ts | 9-10 | `m.M5.behavior`, `m.M5.fifo` | read | e2e
| app/lib/invariants.ts | 4 | `m.M5.fifo` | read | monitor
| app/lib/metrics.ts | 989-990 | `input?.M5?.behavior`, `input?.M5?.fifo` | read | normalize
