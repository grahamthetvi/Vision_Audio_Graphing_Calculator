# ESP32-S3 Firmware (ESP-IDF)

Numerical talking / audio graphing calculator firmware.

**This tree is independent of the website** in the repository root (`index.html`, `app.js`, etc.). The web app continues to ship on GitHub Pages; firmware does not replace it.

## Policy: No CAS

This product is a **numerical** graphing calculator (like a classic TI-84 style device), **not** a Computer Algebra System. There is no symbolic simplify/factor/expand. Expression evaluation uses **TinyExpr** plus the numerical solvers ported from the JS blueprint.

## Hardware (locked for v1)

| Role | Part |
|---|---|
| MCU | ESP32-S3 (PSRAM recommended) |
| Display | ST7789V 240×320 SPI TFT (landscape 320×240) |
| Audio | MAX98357A I2S + 3W 8Ω mono speaker (amp Vin from LiPo OK) |
| TTS | DFRobot Gravity UART (primary) |
| Input | Number pad matrix + optional Trace/Hear/Mute/Mode buttons |
| Power | 2000mAh LiPo PH2.0 + TP4056 Type-C; **do not** use Mini560 buck for single-cell → 5V |

Pin placeholders: [`boards/board.h`](boards/board.h) — edit to match your wiring.

### Cheaper TTS alternatives (documentation)

- XFS5152CE / SYN6288-class UART modules (lower cost; English often weaker)
- DFPlayer Mini + pre-recorded clips (not true TTS)
- On-device software TTS (CPU/RAM cost; usually worse quality)

Firmware abstracts speech behind `speech_*` so backends can swap; Gravity is implemented first.

## Build (ESP-IDF)

Requires [ESP-IDF v5.x](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/get-started/) with the Espressif VS Code extension or `idf.py` on your PATH.

```bash
cd firmware
idf.py set-target esp32s3
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor   # adjust port
```

## Host golden tests (no hardware / no IDF)

Validates C++ engines against the same numerical expectations as the JS `tests/`:

```bash
make -C firmware/host_tests test
```

## Components

| Component | Role |
|---|---|
| `expr` | TinyExpr adapter, rad/deg wrappers |
| `stat_engine` | erf, normalcdf, invNorm, 1/2-var, LinReg |
| `calc_engine` | root / extremum / derivative / integral / inflection |
| `graph_engine` | window transforms + fixed-N curve sampling |
| `sonification_math` | pitch/pan maps + critical points |
| `display` | ST7789 via ESP-IDF `esp_lcd` (grid, Y1, cursor) |
| `keypad` | Number-pad matrix scan + 2nd-layer remap |
| `audio_i2s` | DDS sine → MAX98357A with NaN mute gate |
| `speech` | Gravity UART + text sanitization |
| `ui` | Graph / Equation / Trace / Window state machine |

## Keymap (v1 number pad)

Primary: digits; `A` Enter; `B` 2nd; `C` decimal; `D` backspace; `*` left; `#` right.

In equation mode with 2nd: insert `sin(x)` / `cos(x)` / `tan(x)` / operators (see `ui.cpp`).

Discrete buttons (if wired): Trace, Hear Graph, Mute, Mode cycle.
