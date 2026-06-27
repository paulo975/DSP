# AudioSystem DSP — UDP Control Protocol

Reverse-engineered from 3 Wireshark captures of the official AudioSystem DSP 3.0
software ↔ the DSPPRIMARY hardware (`169.254.10.227`, port **UDP 6001**).

The DSP is the **server** and listens on port **6001** for both bulk control
commands and meter requests. The PC opens an ephemeral UDP port (e.g. 62230,
59847) — first packet from the PC becomes the persistent reply target.

---

## 1. Packet frame

All AudioSystem DSP packets share the same 16-byte header:

```
Offset  Size  Field          Value(s)                     Notes
0       2     Magic          A5 5A                        Identifies an ASDP packet
2       2     Length (LE)    payload bytes after header   e.g. 0x0010=16, 0x0008=8
4       2     Command type   little-endian
6       2     Sequence ctr   little-endian, rolls 0..0xFFFF
8       8     Session/flags  varies per command class
```

After byte 16 comes the command-specific payload.

---

## 2. Command classes observed

### 2.1  Heartbeat / keepalive  (32 B total, payload 16 B)

PC → DSP every ~700 ms:
```
A5 5A | 10 00 | 00 00 | 00 00 | 55 65 00 00 00 00 00 00 | 16 × 00
```
DSP → PC ACK: same structure but length 0 and only 18 B total.

### 2.2  Fader / direct-channel control  (32 B, cmd `0x002D`)

Used while the user drags a fader. Streams one packet per pixel of movement.

```
A5 5A | 10 00 | 2D 00 | <ctr LE> | <channel id 1B> <value 1B> 14×00
                                    ^^             ^^
                                    11 hex = ch    sweeping value 0..7F
```

The value field is the raw 7-bit MIDI-like fader index (0x00..0x7F). The
hardware then maps that to dB internally.

### 2.3  Parameter set  (24 B, cmd class `0x21`)

The *workhorse* of the protocol. Every UI knob, every matrix crosspoint,
every per-band EQ change rides on this single 24-byte frame:

```
A5 5A | 08 00 | 00 00 | 00 00 | 21 <ctr 1B> 00 00 00 00 00 00 | <param ID 2B LE> <sub-param 2B LE> <value 4B LE>
                                ^^                              ^^                 ^^                ^^
                                33 = "set parameter"            which UI control    which axis/index  signed/unsigned
```

The (param ID, sub-param) pair tells the DSP *what* you're touching; the 4-byte
value is the new state.

---

## 3. Parameter IDs (decoded from user-tagged actions)

| Param ID  | Sub-param           | Action                          | Value semantics                                    |
|-----------|---------------------|---------------------------------|----------------------------------------------------|
| `0x012B`  | `0x0002`            | Rename channel (open dialog?)   | last 2B `01 00` = "begin/end edit"                 |
| `0x012B`  | `0x0005`            | Channel mute                    | `00`=off, `01`=on                                  |
| `0x00A7`  | `0x0015`            | Crossover / Low-pass control    | int16 signed sweep, e.g. -970 → +363               |
| `0x00A6`  | `0x0001`            | Matrix routing toggle           | `<row 1B> <col 1B> <state 1B> 00` (state 0/1)     |
| `0x0001`  | `0x0002`            | Compressor / processor block    | signed 16-bit                                      |
| `0x0061`  | `0x0002`/`03`/`04`  | EQ band parameters (freq/gain/Q)| sub-param picks which band axis                    |
| `0x0127`  | `0x0002`/`04`       | Phase / polarity invert         | `00`=normal, `01`=inverted                         |
| `0x00C7`  | `0x0002`/`03`/`04`  | Delay (enable / time / ?)       | sub `02` toggle, sub `03` int16 samples-or-ms      |
| `0x00E7`  | `0x0003`            | (seen during phase action)      | possibly aux parameter                             |

> Sub-param 0x0002, 0x0003, 0x0004 frequently appear as a *triplet* meaning
> "enable + value + sign-or-fine-tune". Need a 4th capture to nail the exact
> meaning of each sub for EQ/Delay before mapping to the web app's data model.

---

## 4. Matrix routing — fully decoded ✅

The matrix routing packet has a particularly clean layout:

```
A5 5A | 08 00 | 00 00 | 00 00 | 21 <ctr> 00*6 | A6 00 01 00 | <row> <col> <state> <pad>
```

Captured examples (user toggled IN0→OUT0, IN1→OUT1, ..., IN4→OUT4, then turned
IN2→OUT1 OFF):

| row | col | state | meaning                          |
|-----|-----|-------|----------------------------------|
| 00  | 00  | 01    | IN1 → OUT1 ON                    |
| 01  | 01  | 01    | IN2 → OUT2 ON                    |
| 02  | 01  | 01    | IN3 → OUT2 ON                    |
| 02  | 01  | 00    | IN3 → OUT2 OFF (toggle)          |
| 02  | 02  | 01    | IN3 → OUT3 ON                    |
| 03  | 03  | 01    | IN4 → OUT4 ON                    |
| 04  | 04  | 01    | IN5 → OUT5 ON                    |

Channel indices are 0-based.

---

## 5. DSP → PC meter stream (UDP 6001 from DSP)

Continuous stream of 4 packet sizes:

| Size  | Header        | Cadence  | Purpose                       |
|-------|---------------|----------|-------------------------------|
| 1024B | `A5 5A F0 03` | ~50 Hz   | Peak meters (32 floats × ?)   |
| 736 B | `A5 5A D0 02` | ~50 Hz   | RMS / secondary metering      |
| 26 B  | `A5 5A 0A 00` | ~1 Hz    | Status update                 |
| 18 B  | `A5 5A 00 00` | reactive | Keepalive ACK                 |

The 1024 B / 736 B payloads contain repeating 2-byte values (e.g. `20 D1`)
suggesting 16-bit signed/unsigned meter samples — to be parsed when the
bridge is built.

---

## 6. Next steps before bridge is shippable

1. **4th capture** focused on isolated EQ band 1 (freq sweep ALONE, then gain
   sweep ALONE, then Q sweep ALONE) so we can pin sub-param 0x0002/03/04
   meaning exactly.
2. **5th capture** isolating Delay (enable + 0 ms, then enable + 10 ms, then
   enable + 100 ms) so we can decode the time-encoding (samples vs µs vs ms).
3. **Encode the meter stream**: figure out which 2-byte chunks map to which
   physical/virtual channels.

Once those are nailed, the bridge can be fully bidirectional.

---

*Last updated: 2026-02-13 (commit pending). Source pcaps stored under
`/tmp/capture*.pcapng` during this dev session.*
