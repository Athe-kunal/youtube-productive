// Every log line is prefixed "[YIF:<context>]" so it's filterable in
// DevTools with pattern "YIF" regardless of which extension surface
// (content script / background / offscreen / options) emitted it.
export function createLogger(context) {
  const prefix = `[YIF:${context}]`;
  return {
    log: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}
