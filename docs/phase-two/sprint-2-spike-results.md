# Sprint 2 spike results

Measured on 2026-10-29 by `apps/desktop/scripts/hybrid-spike.ts` on linux-x64 with the toolchain Arduino CLI installs for `arduino:avr` 1.8.6 (avr-gcc 7.3.0, binutils 2.26). Every number below comes from compiled code run in the emulator; the real-Uno column is Brad's, from `sprint-2-hardware-check.md`.

## Result: go, with the forced-include shim and LTO on

## 1. How the shim intercepts (#57, #59)

Can a Hybrid build redirect the sketch's `digitalRead(7)` to Kiungo without touching the sketch? "Works" means the printed value changed to the pushed one.

| Mechanism | Works | Flash (bytes) |
| --- | --- | --- |
| `--wrap=digitalRead`, LTO on (Arduino's default) | **no** | 1978 |
| `--wrap`, core with LTO, sketch and libraries without (the named fallback) | yes | 2358 |
| `--wrap`, LTO off everywhere | yes | 2434 |
| Forced-include header, LTO on (chosen) | yes | 1798 |
| Plain build, nothing intercepted | | 1978 |

- **`--wrap` with LTO on is silently dropped** on this toolchain (GCC 88643): the build succeeds, the wrapper is not even linked in, and the sketch reads the real pin. A Hybrid build that relied on it would look fine and do nothing.
- Turning LTO off for the sketch and libraries makes `--wrap` work, at +380 bytes over plain here. That is the fallback the plan named, and it stays available.
- **The forced-include header works with LTO on everywhere**, and the mechanism itself costs -180 bytes over plain on this sketch (the same tiny interceptor as the wrap rows): LTO sees through the redirect. What a real Hybrid build adds is the runtime, in section 2. It also reaches header-only code (an `inline` function in a header calling `digitalRead`), because the rename happens at compile time.
- **Serial cannot be intercepted with `--wrap` at all**: `Serial.println` ends in a virtual `HardwareSerial::write` reached through the vtable, which has no symbol reference to wrap. The forced include renames `Serial` itself to a Kiungo stream, so every byte the sketch writes is tagged (test: `apps/desktop/test/hybrid-shim.test.ts`).
- The core's own files are untouched: the header only acts in files that have the KiungoHybrid include path (the sketch and libraries), checked with `__has_include`.

Decision: Tier 1 shim = forced-include header + library-level adapters, LTO on. `--wrap` is not used.

## 2. Footprint (HWT-05)

Flash / RAM in bytes on an Uno (32,256 / 2,048 available).

| Sketch | Plain | Hybrid | Hybrid adds |
| --- | --- | --- | --- |
| Serial only | 1800 / 188 | 2950 / 360 | +1150 / +172 |
| digitalRead + analogRead | 2258 / 188 | 3666 / 392 | +1408 / +204 |
| HC-SR04 with NewPing | 2452 / 212 | 4078 / 403 | +1626 / +191 |

The runtime (COBS link, sensor table, tagged Serial, user-input queue) is the fixed part; adapters add little on top. RAM goes to the 64-byte receive frame, the 32-byte text buffer, the 32-byte input queue and the sensor table.

## 3. Push-to-print delay in the emulator

The check sketch prints every 50 ms. 20 pushes spread across that period:

| Median | Worst | Target |
| --- | --- | --- |
| 24.5 ms | 49.1 ms | 100 ms or less |

The delay is bounded by the sketch's own loop period, not by the link: the runtime reads frames when the sketch next reads the sensor (or between loops). A sketch that reads faster sees the value sooner.

## 4. Electron budgets on this machine

Median of 3 runs (`apps/desktop/scripts/measure-budgets.mjs`), linux-x64, Electron 44.9.3:

| | Measured | Budget |
| --- | --- | --- |
| Time to the window | 357 ms | 3,000 ms |
| Memory, all processes (proportional set size) | 282 MB | 300 MB |
| Memory, sum of working sets | 545 MB | (counts shared pages once per process) |

This is a Linux machine under a virtual display with software rendering. The reference PC (Windows 10, dual-core, 4 GB, SSD) is Brad's run with the same script.

## 5. What a real Uno still has to show

The emulator can't show USB timing, a CH340's behavior, or an unplug. Steps 1 to 6 of `sprint-2-hardware-check.md`, run with `npm run hardware-check -w @kiungo/desktop`, fill those in.

## Known limits of the prototype

- Libraries that read port registers directly need an adapter; NewPing has one, DHT is next (sprint 9, INJ-02). A sensor read through `digitalRead`, `analogRead` or `pulseIn` needs none.
- The sketch's own `Serial.read()` gets bytes the PC sends in IN frames; a library that uses Serial directly for its own purposes still talks to the raw link.
- `ping_timer()` in the NewPing adapter answers at once instead of from Timer2, so Timer2 stays free.
- The runtime polls the link; nothing runs from an interrupt. A sketch that blocks for seconds without reading a sensor or Serial sees pushes only when it comes back.
