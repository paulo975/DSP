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

# Limpar node_modules antigos se existirem do CRA
if [ -f "node_modules/.package-lock.json" ] || [ -f "node_modules/.yarn-integrity" ]; then
  echo -e "${YELLOW}A limpar instalação anterior...${RESET}"
  rm -rf node_modules package-lock.json yarn.lock
fi

# Instalar dependências
echo -e "${YELLOW}A instalar dependências (1-2 min na primeira vez)...${RESET}"
npm install 2>&1 | tail -3
echo -e "${GREEN}✓ Dependências OK${RESET}"
echo ""

echo -e "${GREEN}A iniciar servidor Vite...${RESET}"
echo -e "${CYAN}  Aguarda alguns segundos...${RESET}"
echo ""

# Abrir Chrome Beta quando estiver pronto
(
  for i in $(seq 1 60); do
    sleep 2
    if curl -s --max-time 1 http://localhost:3000 > /dev/null 2>&1; then
      echo ""
      echo -e "${GREEN}✓ Pronto! A abrir Chrome Beta...${RESET}"
      open -a "Google Chrome Beta" "http://localhost:3000"
      break
    fi
  done
) &

# Arrancar Vite
npm start 2>&1
