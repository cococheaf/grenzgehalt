export const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/CHF';
export const FX_PROVIDER = 'https://www.exchangerate-api.com';
export const FX_CACHE_KEY = 'grenzgehalt.fx.chf-eur.v1';
const MAX_AGE = 48 * 60 * 60 * 1000;
const FUTURE_TOLERANCE = 5 * 60 * 1000;

export function validateQuote(quote, now = Date.now(), requireRecent = true) {
  if (!quote || typeof quote !== 'object' || typeof quote.rate !== 'number' || !Number.isFinite(quote.rate)
      || quote.rate <= 0 || quote.rate > 10 || !Number.isSafeInteger(quote.quotedAt)
      || !Number.isSafeInteger(quote.nextUpdateAt) || quote.quotedAt <= 0
      || quote.nextUpdateAt <= quote.quotedAt || quote.nextUpdateAt > quote.quotedAt + MAX_AGE
      || quote.quotedAt > now + FUTURE_TOLERANCE
      || (requireRecent && quote.quotedAt < now - MAX_AGE)) {
    throw new Error('Der Kursdienst hat keinen gültigen oder ausreichend aktuellen CHF/EUR-Kurs geliefert.');
  }
  const rate = Math.round((quote.rate + Number.EPSILON) * 10000) / 10000;
  if (rate <= 0) throw new Error('Der Wechselkurs liegt außerhalb des unterstützten Bereichs.');
  return { rate, quotedAt: quote.quotedAt, nextUpdateAt: quote.nextUpdateAt };
}

export function decodeQuote(data, now = Date.now()) {
  if (data?.result !== 'success' || data.base_code !== 'CHF' || data.rates?.CHF !== 1
      || typeof data.rates?.EUR !== 'number' || !Number.isSafeInteger(data.time_last_update_unix)
      || !Number.isSafeInteger(data.time_next_update_unix)) {
    throw new Error('Der Kursdienst hat keine gültige CHF/EUR-Antwort geliefert.');
  }
  return validateQuote({ rate: data.rates.EUR, quotedAt: data.time_last_update_unix * 1000,
    nextUpdateAt: data.time_next_update_unix * 1000 }, now);
}

export function isFreshQuote(quote, now = Date.now()) {
  try { const valid = validateQuote(quote, now); return now < valid.nextUpdateAt; }
  catch { return false; }
}

export async function fetchExchangeRate({ fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(FX_ENDPOINT, { headers: { Accept: 'application/json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors',
      cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`Kursdienst nicht verfügbar (HTTP ${response.status}).`);
    return decodeQuote(await response.json(), now());
  } finally { clearTimeout(timeout); }
}

// The public quote cache contains no salary inputs. Imported calculations are snapshots.
export function createRateController({ getValue, setValue, onChange = () => {},
  fetchQuote = () => fetchExchangeRate(), readCache = () => null,
  writeCache = () => {}, now = Date.now } = {}) {
  let revision = 0, inFlight = null, failedAt = null;
  let state = { source: 'example', automatic: true, quote: null, snapshot: false, pending: false, error: null };
  const emit = () => onChange({ ...state });
  const metadata = () => ({ source: state.source, automatic: state.automatic, quote: state.quote ? { ...state.quote } : null, snapshot: state.snapshot, provider: state.source === 'api' ? FX_PROVIDER : null });
  function restore(meta, { snapshot = false } = {}) {
    revision += 1;
    let quote = null;
    try { quote = validateQuote(meta?.quote, now(), false); } catch { /* Older/manual files have no quote. */ }
    if (quote && Math.abs(Number(getValue()) - quote.rate) > 0.000001) quote = null;
    state = { ...state, source: quote ? 'api' : meta?.source === 'example' ? 'example' : 'manual',
      quote, automatic: snapshot ? false : meta?.automatic === true,
      snapshot, error: null };
    emit();
  }
  function manualEdit() {
    revision += 1;
    state = { ...state, source: 'manual', automatic: false, snapshot: false, quote: null, error: null };
    emit();
  }
  function setAutomatic(enabled) {
    revision += 1;
    state = { ...state, automatic: Boolean(enabled), snapshot: false, error: null };
    emit();
    return enabled ? (inFlight ? inFlight.then(() => state.automatic ? refresh() : false) : refresh()) : Promise.resolve(false);
  }
  function refresh({ force = false } = {}) {
    if (inFlight) return inFlight;
    if (!force && failedAt !== null && now() - failedAt >= 0 && now() - failedAt < 3600000) {
      state = { ...state, error: 'Bisheriger Kurs bleibt aktiv. Erneuter Abruf ist über „Kurs abrufen“ möglich.' };
      emit(); return Promise.resolve(false);
    }
    const initialRevision = revision, initialValue = getValue();
    state = { ...state, pending: true, error: null }; emit();
    inFlight = Promise.resolve().then(async () => {
      try {
        let cached = null;
        try { cached = readCache(); } catch { /* Storage may be unavailable. */ }
        const quote = !force && isFreshQuote(cached, now())
          ? validateQuote(cached, now()) : validateQuote(await fetchQuote(), now());
        // An edit, import or restore during a network request owns the entered value.
        if (revision !== initialRevision || !Object.is(getValue(), initialValue)) return false;
        if (state.quote && quote.quotedAt < state.quote.quotedAt) throw new Error('Der gelieferte Kurs ist älter als der bereits verwendete Kurs.');
        try { writeCache(quote); } catch { /* A cache failure must not disable conversion. */ }
        failedAt = null;
        state = { ...state, quote, source: 'api', snapshot: false, error: null };
        setValue(quote.rate);
        return true;
      } catch {
        if (revision === initialRevision) { failedAt = now(); state = { ...state,
          error: 'Kursabruf fehlgeschlagen. Der bisherige Kurs bleibt aktiv; manuelle Eingabe ist möglich.' }; }
        return false;
      } finally { state = { ...state, pending: false }; inFlight = null; emit(); }
    });
    return inFlight;
  }
  return { metadata, restore, manualEdit, setAutomatic, refresh,
    get state() { return { ...state, quote: state.quote ? { ...state.quote } : null }; } };
}
