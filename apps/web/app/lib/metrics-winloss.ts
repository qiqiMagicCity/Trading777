export function calcWinLossLots(closes: { pnl: number }[]) {
  let win = 0, loss = 0, flat = 0;
  for (const c of closes) {
    if (c.pnl > 0) win++;
    else if (c.pnl < 0) loss++;
    else flat++;
  }
  const denom = win + loss;
  const rate = denom ? win / denom : 0;
  return { win, loss, flat, rate };
}
