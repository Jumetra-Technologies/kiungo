#!/bin/bash
# build.sh <sketch.ino> <out.hex> [lib dirs...]: compile like arduino:avr:uno (1.8.6) with avr-gcc 7.3.
set -e
CORE=/tmp/claude-0/avr-core
B=/tmp/claude-0/hexbuild/core-obj
F="-mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR -Os -ffunction-sections -fdata-sections -flto -fno-fat-lto-objects"
INC="-I$CORE/cores/arduino -I$CORE/variants/standard"
if [ ! -f $B/core.a ]; then
  mkdir -p $B
  for f in $CORE/cores/arduino/*.c; do avr-gcc -c $F -std=gnu11 $INC $f -o $B/$(basename $f).o; done
  for f in $CORE/cores/arduino/*.cpp; do avr-g++ -c $F -std=gnu++11 -fpermissive -fno-exceptions -fno-threadsafe-statics $INC $f -o $B/$(basename $f).o; done
  for f in $CORE/cores/arduino/*.S; do avr-gcc -c -mmcu=atmega328p -DF_CPU=16000000L -x assembler-with-cpp -flto $INC $f -o $B/$(basename $f).o; done
  avr-gcc-ar rcs $B/core.a $B/*.o
fi
SK="$1"; OUT="$2"; shift 2
W=$(mktemp -d)
LIBINC=""; LIBSRC=""
for d in "$@"; do LIBINC="$LIBINC -I$d"; LIBSRC="$LIBSRC $(ls $d/*.cpp 2>/dev/null || true)"; done
printf '#include <Arduino.h>\n#line 1 "sketch.ino"\n' > $W/sketch.cpp; cat "$SK" >> $W/sketch.cpp
avr-g++ -c $F -std=gnu++11 -fpermissive -fno-exceptions -fno-threadsafe-statics $INC $LIBINC $W/sketch.cpp -o $W/sketch.o
for s in $LIBSRC; do avr-g++ -c $F -std=gnu++11 -fpermissive -fno-exceptions -fno-threadsafe-statics $INC $LIBINC $s -o $W/$(basename $s).o; done
avr-gcc -mmcu=atmega328p -Os -flto -fuse-linker-plugin -Wl,--gc-sections $W/*.o $B/core.a -lm -o $W/sketch.elf
avr-objcopy -O ihex -R .eeprom $W/sketch.elf "$OUT"
avr-size -A $W/sketch.elf | grep -E "^\.(text|data|bss)"
