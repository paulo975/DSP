# AudioSystem DSP Web

Controlador web para o AudioSystem DSP — funciona 100% offline no teu Mac.

## Instalação (uma vez)

```bash
# 1. Clonar o repositório (se ainda não o fizeste)
git clone https://github.com/paulo975/DSP.git
cd DSP

# 2. Instalar
./instalar.sh
```

Precisas de ter **Node.js** instalado (https://nodejs.org — versão LTS).

---

## Usar a app

```bash
./iniciar.sh
```

Abre automaticamente em **http://localhost:3000**

---

## Ligar ao hardware DSP físico (opcional)

Com o cabo Ethernet ligado ao DSPPRIMARY, abre uma segunda janela de Terminal:

```bash
./bridge.sh
```

Se o teu DSP tiver um IP diferente:

```bash
./bridge.sh 192.168.10.50
```

---

## O que funciona offline (sem hardware)

- ✅ Todos os canais (16+16 ou 8+8 Dante)
- ✅ EQ paramétrico de 5 bandas com gráfico interactivo
- ✅ Compressor / Limiter
- ✅ Delay (ms / mm / polegadas)
- ✅ Crossover HPF / LPF
- ✅ Routing Matrix N×N
- ✅ Presets (guarda/carrega configurações)
- ✅ Scene Memory (8 slots com hotkeys 1-8)
- ✅ Import/Export de ficheiros .audiosystemdsp
- ✅ Upload de áudio e monitorização em tempo real
- ✅ Partilha de configurações por URL
- ✅ Impressão de mapa de canais

## O que requer o bridge (hardware ligado)

- Faders físicos → hardware em tempo real
- Mute/Phase/Delay → hardware em tempo real
- Metros PEAK/RMS do hardware (32 canais, 25fps)
- Matrix routing → hardware
