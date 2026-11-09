// Kiungo firmware shim: public header (INJ-01). All symbols use the kg_ prefix (HWT-02).
#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Resets the shim to its power-on state.
void kg_init(void);

// Drains frames from the PC and updates the value cache. Never blocks.
void kg_poll(void);

// Number of kg_poll() calls since kg_init(); used by the handshake telemetry.
uint32_t kg_poll_count(void);

#ifdef __cplusplus
}
#endif
