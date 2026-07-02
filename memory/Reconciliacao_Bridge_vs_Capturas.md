# Reconciliação: `asdp_bridge.py` (repo) vs. capturas de pacotes (esta sessão)

O repositório `paulo975/DSP` já tem uma bridge funcionando (`asdp_bridge/asdp_bridge.py`, UDP porta 6001, WebSocket local `ws://localhost:8765`) com protocolo documentado em `memory/ASDP_PROTOCOL.md`, feito a partir de **3 capturas antigas**. Esta sessão analisou **10 capturas** (incluindo EQ e Fase, que não existiam antes). Cruzando os dois, apareceram divergências concretas — algumas são só documentação desatualizada, mas pelo menos duas são **bugs reais no código que está rodando**.

## 1. Bug confirmado: byte de flag do EQ está errado

`eq_value_payload()` no bridge sempre manda o prefixo `01 00`:

```python
def eq_value_payload(raw_value: int) -> bytes:
    return b"\x01\x00" + max(-32768, min(raw_value, 32767)).to_bytes(2, "little", signed=True)
```

Mas o tráfego real capturado (`off.pcapng`, EQ sub-param `0x0004` = ganho) mostra o prefixo `00 00`, não `01 00`:

```
capturado:  00 00 9c ff   (valor -100, ou seja -1.00 dB)
bridge envia: 01 00 9c ff   (mesmo valor, mas com o flag trocado)
```

Isso se repete em todos os exemplos de frequência (`sub 0x0003`) e Q (`sub 0x0005`) capturados — o flag é sempre `00 00` no tráfego real, nunca `01 00`. O `01 00` no código parece ter sido uma suposição da análise anterior ("flag = enable this band axis") que não bateu quando testada contra mais dados. Se o DSP validar esse byte, os comandos de EQ do bridge podem estar sendo ignorados ou interpretados errado pelo hardware.

**Correção aplicada em `asdp_bridge.py`:** `eq_value_payload()` agora usa `b"\x00\x00"`.

## 2. Gap confirmado: falta o passo de "selecionar/ativar banda" do EQ

A captura `off.pcapng` mostra dois sub-params do EQ que não existem no código nem na documentação anterior:

- `sub 0x0001`: liga/desliga da banda (`0` → `1`) — 2 eventos na sessão
- `sub 0x0002`: seleção de banda (`0,1,2,3,4...`) — 18 eventos

O `cmd_eq()` do bridge só mandava freq/ganho/Q (`sub 3/4/5`) — nunca mandava o `sub 0x0001` (ativar banda) nem `sub 0x0002` (selecionar banda). Se o hardware exigir que a banda esteja "ativada" via `sub 0x0001` antes de aceitar ajustes de freq/ganho/Q, os comandos de EQ do bridge podiam não ter efeito nenhum no som, mesmo sendo aceitos sem erro pela rede.

**Correção aplicada:** `cmd_eq()` agora chama `_arm_eq_band()` automaticamente na primeira vez que uma banda é tocada em cada sessão, enviando `sub 0x0002` (select) e depois `sub 0x0001` (enable) antes do primeiro ajuste de freq/ganho/Q.

## 3. Compressor: `param_id` documentado estava errado, e não havia implementação

- `memory/ASDP_PROTOCOL.md` (versão antiga) chutava `param_id 0x0001, sub 0x0002` para o compressor, marcado como não totalmente decodificado.
- As capturas desta sessão (`Comprensor.pcapng`, 982 pacotes na porta 6001) mostram consistentemente `param_id 0x0023` (não `0x0001`), com `sub 0x0001` = seleção/foco e `sub 0x0002` = valor (int16 LE).
- O bridge não tinha compressor implementado.

**Correção aplicada:** adicionado `cmd_comp(channel, raw_value)` usando `param_id 0x0023`, mesmo padrão do `cmd_delay_ms`/`cmd_phase` já existentes, mais o op `"comp"` no WebSocket. **Escala não confirmada** — recebe valor bruto (int16), não dB.

## 4. Gate: nunca tinha sido documentado nem implementado

As capturas (`Gate.pcapng`) decodificam `param_id 0x0003, sub 0x0002` como o threshold do gate (mesmo padrão de "seleção + valor" do compressor). Isso não aparecia em nenhum lugar do código ou da documentação anterior.

**Correção aplicada:** adicionado `cmd_gate(channel, raw_value)` com `param_id 0x0003`, mais o op `"gate"` no WebSocket. **Escala não confirmada** — recebe valor bruto (int16), não dB.

## 5. Gain/fader: existe um caminho no protocolo que o bridge não usa

O bridge implementa fader via `CMD_FADER` (`0x002D`, frame de 32 bytes, índice bruto 0–127 com curva `_db_to_fader_idx` calibrada "empiricamente"). Mas ao conferir os pacotes de 32 bytes nas capturas `down.pcapng` e `Gain 3db, 45db, 0db, 3db pink noise.pcapng` — que são exatamente sessões de teste de ganho — **nenhum pacote `CMD_FADER` aparece**; só o heartbeat. O ajuste de ganho real nessas capturas trafegou como frames de parâmetro (`classe 0x21`, 24 bytes) com `param_id 0x012B`:

- `down.pcapng`: `sub 0x0001`, valor crescendo em ~40 por passo (39 → 79 → 118 → …)
- `Gain...pcapng`: `sub 0x0003`, valor com um campo fixo (`2`) e um índice 0–7 incrementando

Nem `0x0002` (rename, já documentado) nem `0x0005` (mute, já documentado) batem com isso — são subindexes novos, não usados pelo bridge.

**Nenhuma correção aplicada ainda** — `cmd_fader()` foi deixado como está, porque não sabemos se `0x012B` é um controle diferente (trim de entrada) ou se o fader principal também deveria usar esse caminho. **Precisa de uma captura isolada movendo só o fader principal da UI oficial** para decidir antes de mexer nisso.

## 6. O que bateu perfeitamente (nenhuma mudança necessária)

| Controle | param_id | Confirmado por |
|---|---|---|
| Matrix (crosspoint) | `0x00A6` sub `0x0001` | doc antigo + bridge + capturas desta sessão — 100% de acordo |
| Delay | `0x00F4` sub `0x0002` | doc antigo + bridge + capturas desta sessão — 100% de acordo |
| Fase | `0x0127` sub `0x0002`/`0x0004` | doc antigo + bridge citam ambos os subs; capturas mostram o primeiro toggle em `0x0002` e o resto em `0x0004` — consistente |
| Heartbeat / keepalive | magic `A5 5A`, flags `55 65...` | 100% de acordo em todas as 10 capturas |

## Resumo do que mudou no `asdp_bridge.py`

| # | Item | Status |
|---|---|---|
| 1 | Flag do EQ (`01 00` → `00 00`) | ✅ Corrigido |
| 2 | Ativar/selecionar banda de EQ | ✅ Corrigido (`_arm_eq_band`) |
| 3 | Compressor | ✅ Implementado (`cmd_comp`) — escala não confirmada |
| 4 | Gate | ✅ Implementado (`cmd_gate`) — escala não confirmada |
| 5 | Gain/fader path incerto | ⚠️ Não mexido — precisa de captura isolada |

## Sobre a arquitetura geral

Havia uma proposta anterior (ADR) de priorizar um protocolo de controle oficial e documentado da Symetrix (Composer Control Protocol, porta 48631) sobre este protocolo interno. Com a confirmação de que **este protocolo interno já está implementado e em uso em produção** nesta bridge, essa troca vira uma decisão de migração futura, não de ponto de partida — o custo de trocar agora é maior do que se assumia antes de existir código funcionando. A correção dos itens 1–5 acima é prioridade imediata; migrar para um protocolo oficial (se existir e width fizer sentido para este hardware específico) fica como decisão separada de médio prazo.
