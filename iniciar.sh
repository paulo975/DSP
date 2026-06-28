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

cd "$DIR/frontend"

# Matar qualquer processo no porto 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Garantir que os node_modules estão correctos
echo -e "${YELLOW}A verificar dependências...${RESET}"
npm install 2>&1 | tail -3
echo -e "${GREEN}✓ Dependências OK${RESET}"
echo ""

echo -e "${GREEN}A iniciar servidor...${RESET}"
echo -e "${CYAN}  Aguarda ~30 segundos na primeira vez${RESET}"
echo ""

# Abrir browser quando estiver pronto
(
  for i in $(seq 1 90); do
    sleep 2
    if curl -s --max-time 1 http://localhost:3000 > /dev/null 2>&1; then
      echo ""
      echo -e "${GREEN}✓ Pronto! A abrir Chrome Beta...${RESET}"
      open -a "Google Chrome Beta" "http://localhost:3000"
      break
    fi
  done
) &

# Arrancar
BROWSER=none npx craco start 2>&1
