#!/bin/bash
# ============================================================
#  AudioSystem DSP Web — Arrancar a app
# ============================================================

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RESET="\033[0m"

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}▶ AudioSystem DSP Web${RESET}"
echo ""

cd "$DIR/frontend"

# Matar qualquer processo no porto 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Instalar dependências com --legacy-peer-deps para resolver conflitos
echo -e "${YELLOW}A instalar dependências...${RESET}"
npm install --legacy-peer-deps 2>&1 | tail -3
echo -e "${GREEN}✓ Dependências OK${RESET}"
echo ""

# Verificar se o craco existe
CRACO="$DIR/frontend/node_modules/.bin/craco"
if [ ! -f "$CRACO" ]; then
  echo -e "${YELLOW}A instalar craco...${RESET}"
  npm install --save-dev @craco/craco --legacy-peer-deps 2>&1 | tail -3
fi

echo -e "${GREEN}A iniciar servidor...${RESET}"
echo -e "${CYAN}  Aguarda ~30-60 segundos na primeira compilação${RESET}"
echo ""

# Abrir browser quando estiver pronto
(
  for i in $(seq 1 90); do
    sleep 3
    if curl -s --max-time 1 http://localhost:3000 > /dev/null 2>&1; then
      echo ""
      echo -e "${GREEN}✓ Pronto! A abrir Chrome Beta...${RESET}"
      open -a "Google Chrome Beta" "http://localhost:3000"
      break
    fi
  done
) &

# Arrancar com o craco local
BROWSER=none "$CRACO" start 2>&1
