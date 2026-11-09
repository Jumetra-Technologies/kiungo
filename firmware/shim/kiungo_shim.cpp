// Entry points of the hybrid layer. All storage is static (HWT-05).
#include "kiungo_shim.h"

namespace {
uint32_t poll_count = 0;
}  // namespace

extern "C" {

void kg_init(void) { poll_count = 0; }

void kg_poll(void) { poll_count++; }

uint32_t kg_poll_count(void) { return poll_count; }

}  // extern "C"
