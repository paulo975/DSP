#!/bin/bash
# ============================================================
#  ASDP Bridge — Liga a app web ao hardware DSP físico
#  Corre numa janela de Terminal separada enquanto usas a app.
#
#  Pré-requisito: cabo Ethernet ligado ao DSPPRIMARY
#  IP padrão do hardware: 169.254.10.227
# ============================================================

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RESET="\033[0m"

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   ASDP Bridge — Hardware DSP             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Hardware IP: ${CYAN}169.254.10.227:6001${RESET}"
echo -e "  WebSocket:   ${CYAN}ws://localhost:8765${RESET}"
echo ""
echo -e "${YELLOW}  Certifica-te que o cabo Ethernet está ligado.${RESET}"
echo -e "${GREEN}  (Ctrl+C para parar o bridge)${RESET}"
echo ""

# IP do DSP pode ser passado como argumento: ./bridge.sh 192.168.10.50
DSP_IP="${1:-169.254.10.227}"

python3 "$DIR/asdp_bridge/asdp_bridge.py" --dsp-ip "$DSP_IP" --verbose
