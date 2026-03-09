#!/bin/zsh
set -euo pipefail

REPO_DIR="/Users/loridy/.openclaw/workspace/projects/stock-market-recap-multi-dimension"
LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"

# Always evaluate schedule logic in Hong Kong time.
export TZ="Asia/Hong_Kong"

RUN_DATE=$(date +%F)
DOW=$(date +%u) # 1=Mon ... 7=Sun

if [[ "$DOW" -eq 1 ]]; then
  # Monday 08:00 HKT -> publish Monday report using Friday market context + Sunday news window
  MARKET_DATE=$(date -v-3d +%F)
  NEWS_DATE=$(date -v-1d +%F)
else
  # Tue-Fri (and manual weekend runs) -> previous day for both market/news context
  MARKET_DATE=$(date -v-1d +%F)
  NEWS_DATE=$(date -v-1d +%F)
fi

TS=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/recap-scheduled-$TS.log"

{
  echo "[$(date '+%F %T %Z')] Scheduled recap starting"
  echo "Computed RUN_DATE=$RUN_DATE MARKET_DATE=$MARKET_DATE NEWS_DATE=$NEWS_DATE"

  cd "$REPO_DIR"

  if [[ -f ".env" ]]; then
    set -a
    source ./.env
    set +a
    echo "Loaded .env"
  else
    echo "WARN: .env not found"
  fi

  npm run recap -- --date "$RUN_DATE" --market-date "$MARKET_DATE" --news-date "$NEWS_DATE" --analyst default --regime Mixed

  echo "[$(date '+%F %T %Z')] Scheduled recap finished"
} >> "$LOG_FILE" 2>&1
