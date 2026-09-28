# Run inside the Junior Investor pod (has yfinance + Yahoo access). Prints JSON to stdout.
import json, sys
import yfinance as yf
T = "CSCO AMZN KO AAPL NOK BB MSFT C WMT MCD ZM CCL COST TLT SHY QQQ XOM SPY".split()
out = {}
for t in T:
    h = yf.Ticker(t).history(start="1999-12-01", end="2025-02-01", interval="1mo", auto_adjust=True)
    out[t] = {d.strftime("%Y-%m"): round(float(c), 4) for d, c in zip(h.index, h["Close"]) if c == c}
    print(t, len(out[t]), file=sys.stderr)
json.dump(out, sys.stdout, separators=(",", ":"))
