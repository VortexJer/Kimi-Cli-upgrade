// Rough token estimator. Moonshot's tokenizer is not public, so we approximate.
// For English prose, ~4 chars/token is a common rule of thumb.
// For code with many symbols, it tends toward ~3 chars/token.
// We use a blended estimate that errs slightly high to avoid underestimating.
function estimateTokens(text) {
  if (!text) return 0;
  const chars = String(text).length;
  const words = String(text).split(/\s+/).filter(Boolean).length;
  // Blend: code-heavy text has more tokens per word; prose has fewer.
  return Math.ceil((chars / 4) + (words / 8));
}

function formatTokenCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

module.exports = { estimateTokens, formatTokenCount };
