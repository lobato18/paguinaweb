#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/lobato/proyecto/web"
LOG="$ROOT/blog-generacion.log"
LOCK="/tmp/tecnolobato-blog.lock"

export HOME="/home/lobato"
export GIT_TERMINAL_PROMPT=0
export PATH="/usr/local/bin:/usr/bin:/bin"

cd "$ROOT"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -Is)] Ya hay una publicación en curso; salgo." >> "$LOG"
  exit 0
fi

{
  echo "=== Publicación del $(date -Is) ==="
  /usr/bin/node scripts/generar-post-diario.mjs

  if [ -z "$(git status --porcelain -- blog.html blog sitemap.xml)" ]; then
    echo "No hay cambios que publicar."
    exit 0
  fi

  git add blog.html blog sitemap.xml
  git commit -m "Blog: artículo diario $(date +%F)"
  git push origin main
  echo "Publicación completada."
} >> "$LOG" 2>&1
