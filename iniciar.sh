#!/bin/bash
# ============================================================
#  AudioSystem DSP Web — Arrancar a app
# ============================================================

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}▶ AudioSystem DSP Web${RESET}"
echo ""

cd "$DIR/frontend"

# Matar qualquer processo no porto 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Limpar instalação anterior
if [ -d "node_modules" ]; then
  echo -e "${YELLOW}A limpar instalação anterior...${RESET}"
  rm -rf node_modules package-lock.json
fi

# Instalar com --legacy-peer-deps para resolver conflitos
echo -e "${YELLOW}A instalar dependências (2-3 min)...${RESET}"
npm install --legacy-peer-deps

# Verificar se o vite foi instalado
if [ ! -f "node_modules/.bin/vite" ]; then
  echo -e "${RED}Vite não instalado. A instalar manualmente...${RESET}"
  npm install --save-dev vite @vitejs/plugin-react --legacy-peer-deps
fi

echo -e "${GREEN}✓ Dependências OK${RESET}"
echo ""
echo -e "${GREEN}A iniciar servidor...${RESET}"
echo -e "${CYAN}  Aguarda alguns segundos...${RESET}"
echo ""

# Abrir Chrome Beta quando estiver pronto
(
  for i in $(seq 1 60); do
    sleep 3
    if curl -s --max-time 1 http://localhost:3000 > /dev/null 2>&1; then
      echo ""
      echo -e "${GREEN}✓ Pronto! A abrir Chrome Beta...${RESET}"
      open -a "Google Chrome Beta" "http://localhost:3000"
      break
    fi
  done
) &

# Arrancar com caminho absoluto para o vite
"$DIR/frontend/node_modules/.bin/vite" 2>&1
