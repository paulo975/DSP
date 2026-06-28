#!/bin/bash
# ============================================================
#  AudioSystem DSP Web — Arrancar a app
# ============================================================

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}▶ AudioSystem DSP Web${RESET}"
echo ""

if [ ! -d "$DIR/frontend/node_modules" ]; then
  echo -e "${YELLOW}A instalar dependências...${RESET}"
  bash "$DIR/instalar.sh"
fi

cd "$DIR/frontend"

# Matar qualquer processo que esteja a usar o porto 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo -e "${YELLOW}Porto 3000 libertado.${RESET}" || true

echo -e "${GREEN}A iniciar servidor...${RESET}"
echo ""

# Abrir browser quando estiver pronto
(
  for i in $(seq 1 90); do
    sleep 2
    if curl -s --max-time 1 http://localhost:3000 > /dev/null 2>&1; then
      echo ""
      echo -e "${GREEN}✓ Servidor pronto! A abrir Chrome Beta...${RESET}"
      open -a "Google Chrome Beta" "http://localhost:3000"
      break
    fi
  done
) &

# Arrancar com output visível para diagnóstico
BROWSER=none npm start 2>&1
