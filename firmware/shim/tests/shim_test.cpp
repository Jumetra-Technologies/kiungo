// Host-side test, built and run by the quality gate with the system C++ compiler.
#include <stdio.h>

#include "kiungo_shim.h"

static int failures = 0;

#define CHECK(condition)                                               \
  do {                                                                 \
    if (!(condition)) {                                                \
      fprintf(stderr, "FAILED: %s (line %d)\n", #condition, __LINE__); \
      failures++;                                                      \
    }                                                                  \
  } while (0)

int main(void) {
  kg_init();
  CHECK(kg_poll_count() == 0);

  kg_poll();
  kg_poll();
  CHECK(kg_poll_count() == 2);

  kg_init();
  CHECK(kg_poll_count() == 0);

  return failures == 0 ? 0 : 1;
}
