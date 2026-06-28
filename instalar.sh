#!/bin/bash
# ============================================================
#  AudioSystem DSP Web — Instalador local para macOS
#  Corre UMA VEZ para configurar tudo.
#  Depois usa: ./iniciar.sh  (para arrancar)
# ============================================================

set -e
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   AudioSystem DSP Web — Instalador       ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Node.js ────────────────────────────────────────────
echo -e "${BOLD}[1/4] A verificar Node.js...${RESET}"
if ! command -v node &>/dev/null; then
  echo -e "${RED}Node.js não encontrado.${RESET}"
  echo "Instala em: https://nodejs.org  (versão LTS)"
  echo "Ou com Homebrew:  brew install node"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "${GREEN}✓ Node.js $NODE_VER${RESET}"

# ── 2. Yarn / npm ─────────────────────────────────────────
echo -e "${BOLD}[2/4] A verificar gestor de pacotes...${RESET}"
if command -v yarn &>/dev/null; then
  PKG_MGR="yarn"
  echo -e "${GREEN}✓ Yarn $(yarn -v)${RESET}"
elif command -v npm &>/dev/null; then
  PKG_MGR="npm"
  echo -e "${GREEN}✓ npm $(npm -v)${RESET}"
else
  echo -e "${RED}npm não encontrado (deve vir com o Node.js).${RESET}"
  exit 1
fi

# ── 3. Python 3 (para o ASDP bridge) ─────────────────────
echo -e "${BOLD}[3/4] A verificar Python 3...${RESET}"
if command -v python3 &>/dev/null; then
  PY_VER=$(python3 --version)
  echo -e "${GREEN}✓ $PY_VER${RESET}"
  echo -e "   A instalar dependências do bridge..."
  pip3 install websockets --quiet --break-system-packages 2>/dev/null \
    || pip3 install websockets --quiet 2>/dev/null \
    || echo -e "${YELLOW}⚠ Instala manualmente: pip3 install websockets${RESET}"
  echo -e "${GREEN}✓ Bridge ASDP pronto${RESET}"
else
  echo -e "${YELLOW}⚠ Python 3 não encontrado — o bridge ASDP não vai funcionar.${RESET}"
  echo "  Instala em: https://python.org  ou:  brew install python"
fi

# ── 4. Dependências do frontend ───────────────────────────
echo -e "${BOLD}[4/4] A instalar dependências do frontend...${RESET}"
cd "$DIR/frontend"
if [ "$PKG_MGR" = "yarn" ]; then
  yarn install --frozen-lockfile 2>&1 | tail -5
else
  npm install 2>&1 | tail -5
fi
echo -e "${GREEN}✓ Dependências instaladas${RESET}"

# ── Criar ficheiro de configuração local ──────────────────
cd "$DIR/frontend"
if [ ! -f ".env" ]; then
  cat > .env << 'ENV'
# Configuração local — não precisa de servidor externo
REACT_APP_BACKEND_URL=http://localhost:8001
BROWSER=none
ENV
  echo -e "${GREEN}✓ .env criado${RESET}"
fi

# ── Resumo ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Instalação concluída! ✓                ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║                                          ║${RESET}"
echo -e "${BOLD}║  Para arrancar a app:                    ║${RESET}"
echo -e "${BOLD}║    ./iniciar.sh                          ║${RESET}"
echo -e "${BOLD}║                                          ║${RESET}"
echo -e "${BOLD}║  A app abre em: http://localhost:3000    ║${RESET}"
echo -e "${BOLD}║                                          ║${RESET}"
echo -e "${BOLD}║  Para controlar o hardware DSP físico:   ║${RESET}"
echo -e "${BOLD}║    ./bridge.sh   (noutra janela)         ║${RESET}"
echo -e "${BOLD}║                                          ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
