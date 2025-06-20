import axios from 'axios';
const API_KEY = 'd19cvm9r01qmm7tudrk0d19cvm9r01qmm7tudrkg';
export async function fetchQuotes(symbols=[]) {
  const results = {};
  await Promise.all(symbols.map(async s => {
    try {
      const { data } = await axios.get('https://finnhub.io/api/v1/quote',{
        params:{ symbol:s, token:API_KEY }
      });
      results[s] = data.c || null;
    } catch {
      results[s] = null;
    }
  }));
  return results;
}
