#!/bin/bash
# ============================================================
#  AudioSystem DSP Web — Arrancar a app
#  Abre automaticamente no Google Chrome Beta
# ============================================================

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

# Verificar dependências
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

echo -e "${GREEN}A compilar... aguarda (pode demorar 1-2 min na primeira vez)${RESET}"
echo ""

# Aguardar que o porto 3000 esteja activo antes de abrir o browser
(
  echo "A aguardar o servidor..."
  for i in $(seq 1 60); do
    sleep 2
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
      echo -e "${GREEN}Servidor pronto! A abrir o Chrome Beta...${RESET}"
      open -a "Google Chrome Beta" "http://localhost:3000"
      break
    fi
    echo "  ($((i*2))s) ainda a compilar..."
  done
) &

# Iniciar o servidor
if [ "$PKG_MGR" = "yarn" ]; then
  yarn start
else
  npm start
fi
