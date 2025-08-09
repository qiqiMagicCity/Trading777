export async function loadJson(name: 'trades'|'initial_positions'|'close_prices') {
  const url = `/${name}.json`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
        return data;
      }
    }
  } catch {
    // ignore fetch errors
  }
  switch (name) {
    case 'trades':
      return (await import('../../public/trades.json')).default;
    case 'initial_positions':
      return (await import('../../public/initial_positions.json')).default;
    case 'close_prices':
      return (await import('../../public/close_prices.json')).default;
  }
}
