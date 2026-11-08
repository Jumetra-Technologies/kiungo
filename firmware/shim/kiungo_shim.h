// Kiungo firmware shim: public header (INJ-01). All symbols use the kg_ prefix (HWT-02).
#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void kg_init(void);
void kg_poll(void);  // drain frames from the PC, update the value cache

#ifdef __cplusplus
}
#endif
