#!/bin/bash
# ============================================================
#  AudioSystem DSP Web — Arrancar a app
#  Abre automaticamente no Google Chrome Beta
# ============================================================

set -e
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RESET="\033[0m"

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}▶ AudioSystem DSP Web${RESET}"
echo -e "${CYAN}  http://localhost:3000${RESET}"
echo ""

# Verificar se as dependências estão instaladas
if [ ! -d "$DIR/frontend/node_modules" ]; then
  echo -e "${YELLOW}Dependências não instaladas. A correr instalador...${RESET}"
  bash "$DIR/instalar.sh"
fi

cd "$DIR/frontend"

# Detectar gestor de pacotes
if command -v yarn &>/dev/null && [ -f "yarn.lock" ]; then
  PKG_MGR="yarn"
else
  PKG_MGR="npm"
fi

echo -e "${GREEN}A iniciar...  (Ctrl+C para parar)${RESET}"
echo ""

# Abrir no Google Chrome Beta após 4 segundos
(sleep 4 && open -a "Google Chrome Beta" "http://localhost:3000") &

# Iniciar o servidor de desenvolvimento
if [ "$PKG_MGR" = "yarn" ]; then
  yarn start
else
  npm start
fi
