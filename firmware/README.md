# Firmware

Code that runs on boards, not on the PC.

| Folder      | Purpose                                                           | Spec       |
| ----------- | ----------------------------------------------------------------- | ---------- |
| `shim/`     | Tier 1 hybrid layer linked into the user's binary (`kg_` symbols) | INJ-01..04 |
| `injector/` | Tier 2 companion board that behaves like a sensor                 | INJ-08     |
| `bridge/`   | Real sensors/actuators for an emulated board                      | INJ-12     |

Rules: static allocation only, no heap, every symbol prefixed `kg_`, and CI fails if the
shim grows past its recorded size budget (HWT-05).
