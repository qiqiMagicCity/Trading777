export const numberColor = (val: number) => {
  if (val > 0) return 'text-emerald-400'
  if (val < 0) return 'text-red-400'
  return 'text-gray-400'
}
