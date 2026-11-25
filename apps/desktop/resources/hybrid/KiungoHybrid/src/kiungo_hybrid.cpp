// Kiungo Hybrid runtime. See kiungo_hybrid.h for the link format.
#include "kiungo_hybrid.h"

#include <string.h>
#include <util/atomic.h>

// The shim header renamed these for the sketch; this file wants the real ones.
#undef Serial
#undef digitalRead
#undef analogRead
#undef pulseIn
#undef pulseInLong
#undef serialEvent
#undef digitalWrite
#undef analogWrite
#define LINK Serial

#ifndef KIUNGO_PIN_TABLE
// Built without a generated shim header (a plain compile of the library): no pin is virtual.
#define KIUNGO_PIN_TABLE {}
#endif
static const uint8_t pinSensor[] PROGMEM = KIUNGO_PIN_TABLE;
static const uint8_t pinSensorCount = sizeof(pinSensor);

int8_t kiungo_sensor_for_pin(uint8_t pin) {
  if (pin >= pinSensorCount) return -1;
  uint8_t s = pgm_read_byte(pinSensor + pin);
  return s == 0xFF ? -1 : (int8_t)s;
}

// ----- sensor table -----
static int32_t sensorValue[KIUNGO_MAX_SENSORS];
static uint8_t sensorKnown[(KIUNGO_MAX_SENSORS + 7) / 8];

static inline bool known(uint8_t id) { return id < KIUNGO_MAX_SENSORS && (sensorKnown[id >> 3] & (1 << (id & 7))); }

int32_t kiungo_sensor_value(uint8_t sensor, int32_t fallback) {
  kiungo_poll();
  return known(sensor) ? sensorValue[sensor] : fallback;
}

bool kiungo_sensor_known(uint8_t sensor) {
  kiungo_poll();
  return known(sensor);
}

// ----- safety (SAF-01, SAF-02) -----
static volatile uint8_t safeReason = KIUNGO_SAFE_NONE;
static volatile bool safePending = false;
/** The watchdog runs once the PC has said hello. */
static volatile bool armed = false;
/** Timer0 compare-A ticks (about 1.024 ms each), and the tick the link was last heard. */
static volatile uint16_t ticks = 0;
static volatile uint16_t heardAt = 0;
static volatile int lastAvailable = 0;
static void enterSafe(uint8_t reason);

uint8_t kiungo_safe_reason() { return safeReason; }

static void heard() {
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { heardAt = ticks; }
}

// ----- stats -----
static uint16_t framesIn = 0, framesBad = 0, framesDropped = 0;

// ----- user input queue (IN frames -> Serial.read) -----
static uint8_t inBuf[32];
static uint8_t inHead = 0, inTail = 0;
static inline uint8_t inCount() { return (uint8_t)(inHead - inTail); }

// ----- COBS decoder, fed one byte at a time -----
static uint8_t rx[KIUNGO_FRAME_MAX];
static uint8_t rxLen = 0;
static uint8_t rxCode = 0, rxRun = 0;
static bool rxBad = false;

static void handle(const uint8_t* frame, uint8_t len);
static void flushOut(bool force);

static void rxReset() {
  rxLen = 0;
  rxCode = 0;
  rxRun = 0;
  rxBad = false;
}

static void rxByte(uint8_t b) {
  if (b == 0) {  // end of frame
    if (rxLen > 0 && !rxBad && rxRun == 0) {  // a run cut short means a truncated frame
      framesIn++;
      handle(rx, rxLen);
    } else if (rxLen > 0 || rxBad || rxRun != 0) {
      framesBad++;
    }
    rxReset();
    return;
  }
  if (rxBad) return;
  if (rxRun == 0) {
    // A code byte: distance to the next zero. If the previous code was 0xFF, no zero is implied.
    if (rxCode != 0 && rxCode != 0xFF) {
      if (rxLen >= KIUNGO_FRAME_MAX) { rxBad = true; return; }
      rx[rxLen++] = 0;
    }
    rxCode = b;
    rxRun = (uint8_t)(b - 1);
    return;
  }
  if (rxLen >= KIUNGO_FRAME_MAX) { rxBad = true; return; }
  rx[rxLen++] = b;
  rxRun--;
}

static void handle(const uint8_t* f, uint8_t len) {
  if (len < 1) return;
  heard();
  switch (f[0]) {
    case KIUNGO_SET:
      if (len == 6 && f[1] < KIUNGO_MAX_SENSORS) {
        int32_t v = (int32_t)((uint32_t)f[2] | ((uint32_t)f[3] << 8) | ((uint32_t)f[4] << 16) | ((uint32_t)f[5] << 24));
        sensorValue[f[1]] = v;
        sensorKnown[f[1] >> 3] |= (1 << (f[1] & 7));
      } else {
        framesBad++;
      }
      break;
    case KIUNGO_IN:
      // Bytes the sketch hasn't read yet queue up to 32; beyond that each byte is counted as dropped.
      for (uint8_t i = 1; i < len; i++) {
        if (inCount() >= sizeof(inBuf)) { framesDropped++; continue; }
        inBuf[inHead++ & (sizeof(inBuf) - 1)] = f[i];
      }
      break;
    case KIUNGO_PING: {
      uint8_t seq = len > 1 ? f[1] : 0;
      kiungo_send(KIUNGO_ACK, &seq, 1);
      // The PC pings while it listens: the outputs' latest state goes with the answer.
      flushOut(true);
      if (safeReason != KIUNGO_SAFE_NONE) safePending = true;
      break;
    }
    case KIUNGO_STOP:
      enterSafe(len > 1 && f[1] == KIUNGO_SAFE_EMERGENCY ? KIUNGO_SAFE_EMERGENCY : KIUNGO_SAFE_STOP);
      armed = false;
      break;
    case KIUNGO_HELLO: {
      // The PC is back: a link-lost safe state ends (the outputs stay low until the sketch writes them).
      ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        if (safeReason == KIUNGO_SAFE_LINK_LOST) safeReason = KIUNGO_SAFE_NONE;
        armed = true;
      }
      uint8_t p[2] = {KIUNGO_PROTOCOL, KIUNGO_MAX_SENSORS};
      kiungo_send(KIUNGO_HELLO_ACK, p, 2);
      uint8_t s[6] = {(uint8_t)framesIn, (uint8_t)(framesIn >> 8), (uint8_t)framesBad, (uint8_t)(framesBad >> 8), (uint8_t)framesDropped, (uint8_t)(framesDropped >> 8)};
      kiungo_send(KIUNGO_STATS, s, 6);
      break;
    }
    default:
      framesBad++;
  }
}

void kiungo_poll() {
  while (LINK.available() > 0) rxByte((uint8_t)LINK.read());
  flushOut(false);
}

// Arduino's main() calls serialEvent() between loop() iterations when bytes wait.
void serialEvent() {
  kiungo_poll();
  if (kiungo_user_serialEvent && kiungoSerial.available()) kiungo_user_serialEvent();
}

// ----- COBS encoder: write a frame straight to the UART -----
bool kiungo_send(uint8_t type, const uint8_t* payload, uint8_t length) {
  // Encode into a small stack buffer: type + payload, COBS, trailing zero.
  if (length > KIUNGO_FRAME_MAX - 1) length = KIUNGO_FRAME_MAX - 1;
  uint8_t raw[KIUNGO_FRAME_MAX];
  raw[0] = type;
  memcpy(raw + 1, payload, length);
  uint8_t n = (uint8_t)(length + 1);
  uint8_t enc[KIUNGO_FRAME_MAX + 3];
  uint8_t codeAt = 0, code = 1, w = 1;
  for (uint8_t i = 0; i < n; i++) {
    if (raw[i] == 0) {
      enc[codeAt] = code;
      codeAt = w++;
      code = 1;
    } else {
      enc[w++] = raw[i];
      code++;
      if (code == 0xFF) {
        enc[codeAt] = code;
        codeAt = w++;
        code = 1;
      }
    }
  }
  enc[codeAt] = code;
  enc[w++] = 0;
  // A frame that doesn't fit in the UART buffer is dropped whole rather than
  // blocking the user's code (OUT-01: digitalWrite must never wait on USB).
  if (LINK.availableForWrite() < w) { framesDropped++; return false; }
  LINK.write(enc, w);
  return true;
}

// ----- outputs: what the sketch drove (OUT-01) -----
#define KIUNGO_OUT_PINS 20
static uint32_t outLevels = 0;
/** Pins the sketch has written: the others are inputs, or not used. */
static volatile uint32_t outDriven = 0;
static uint32_t pwmPins = 0;
static uint8_t pwmValue[KIUNGO_OUT_PINS];
static bool outDirty = false;

// Sent as soon as the UART has room. When it hasn't (a sketch writing pins in
// a tight loop), the frame waits and the latest state goes on a later call:
// the link never slows the sketch down.
static void flushOut(bool force) {
  if (safePending) {
    uint8_t r = safeReason;
    if (kiungo_send(KIUNGO_SAFE, &r, 1)) safePending = false;
  }
  if (!outDirty && !force) return;
  uint8_t p[8 + 2 * KIUNGO_OUT_PINS];
  for (uint8_t i = 0; i < 4; i++) {
    p[i] = (uint8_t)(outLevels >> (8 * i));
    p[4 + i] = (uint8_t)(outDriven >> (8 * i));
  }
  uint8_t n = 8;
  for (uint8_t pin = 0; pin < KIUNGO_OUT_PINS; pin++) {
    if (pwmPins & (1UL << pin)) {
      p[n++] = pin;
      p[n++] = pwmValue[pin];
    }
  }
  // Dropped when the UART is busy: it stays due, and goes on a later call.
  if (kiungo_send(KIUNGO_OUT, p, n)) outDirty = false;
}

void kiungo_digitalWrite(uint8_t pin, uint8_t value) {
  if (pin >= KIUNGO_OUT_PINS) {
    if (safeReason == KIUNGO_SAFE_NONE) digitalWrite(pin, value);
    return;
  }
  uint32_t bit = 1UL << pin;
  bool wasDriven;
  // Checked and written with interrupts off, so the watchdog can't trip in between and miss this pin.
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    if (safeReason != KIUNGO_SAFE_NONE) return;
    digitalWrite(pin, value);
    wasDriven = outDriven & bit;
    outDriven |= bit;
  }
  uint32_t levels = value ? (outLevels | bit) : (outLevels & ~bit);
  if (levels == outLevels && wasDriven && !(pwmPins & bit)) return;
  outLevels = levels;
  pwmPins &= ~bit;
  outDirty = true;
  flushOut(false);
}

void kiungo_analogWrite(uint8_t pin, int value) {
  if (pin >= KIUNGO_OUT_PINS) {
    if (safeReason == KIUNGO_SAFE_NONE) analogWrite(pin, value);
    return;
  }
  uint32_t bit = 1UL << pin;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    if (safeReason != KIUNGO_SAFE_NONE) return;
    analogWrite(pin, value);
    outDriven |= bit;
  }
  // analogWrite(0) and analogWrite(255) are plain low and high, as on the board.
  if (value <= 0 || value >= 255) {
    pwmPins &= ~bit;
    outLevels = value >= 255 ? (outLevels | bit) : (outLevels & ~bit);
  } else {
    if ((pwmPins & bit) && pwmValue[pin] == (uint8_t)value) return;
    pwmPins |= bit;
    pwmValue[pin] = (uint8_t)value;
    outLevels &= ~bit;
  }
  outDirty = true;
  flushOut(false);
}

// ----- the safe state -----
// Every driven pin low, PWM off, virtual sensors back to "no value". Runs in
// the watchdog's interrupt or with interrupts off; digitalWrite is safe there.
static void enterSafe(uint8_t reason) {
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    if (safeReason == KIUNGO_SAFE_EMERGENCY) return;  // the strongest reason holds
    if (safeReason != KIUNGO_SAFE_NONE && reason == KIUNGO_SAFE_LINK_LOST) return;
    safeReason = reason;
    for (uint8_t pin = 0; pin < KIUNGO_OUT_PINS; pin++) {
      if (outDriven & (1UL << pin)) digitalWrite(pin, LOW);
    }
    outLevels = 0;
    pwmPins = 0;
    outDirty = true;
    memset(sensorKnown, 0, sizeof(sensorKnown));
    safePending = true;
  }
}

// The watchdog (SAF-02): Timer0 overflows drive millis(); its compare-A
// interrupt is free and fires once per overflow, about every 1.024 ms,
// whatever OCR0A is set to (analogWrite on pin 6 included).
ISR(TIMER0_COMPA_vect) {
  ticks++;
  // Bytes arriving, or the sketch reading them, mean the PC is there.
  int available = LINK.available();
  if (available != lastAvailable || available >= SERIAL_RX_BUFFER_SIZE - 8) {
    // A full buffer can't show new bytes: count it as heard until the sketch reads it.
    lastAvailable = available;
    heardAt = ticks;
    return;
  }
  if (armed && safeReason == KIUNGO_SAFE_NONE && (uint16_t)(ticks - heardAt) > KIUNGO_WATCHDOG_MS) enterSafe(KIUNGO_SAFE_LINK_LOST);
}


// delay() calls yield() while it waits: frames are handled then, so a STOP
// reaches the outputs at once even in the middle of a long delay. A sketch
// with its own serialEvent() keeps the bytes for it instead (the core only
// calls serialEvent when bytes wait on the port); a STOP then lands through
// the watchdog, within KIUNGO_WATCHDOG_MS, as the PC stops pinging.
void yield() {
  if (!kiungo_user_serialEvent) kiungo_poll();
}

// The Arduino core calls initVariant() after init() and before setup(): the
// link starts here, so a sketch that never calls Serial.begin (Blink) still
// talks to Kiungo.
static bool linkStarted = false;
static void startLink() {
  if (linkStarted) return;
  LINK.begin(KIUNGO_LINK_BAUD);
  linkStarted = true;
}
// The watchdog's interrupt starts here too.
void initVariant() {
  startLink();
  TIMSK0 |= _BV(OCIE0A);
}

// ----- pin functions -----
int kiungo_digitalRead(uint8_t pin) {
  int8_t s = kiungo_sensor_for_pin(pin);
  if (s < 0) return digitalRead(pin);
  return kiungo_sensor_value((uint8_t)s, LOW) ? HIGH : LOW;
}

int kiungo_analogRead(uint8_t pin) {
  // analogRead accepts A0..A5 or 0..5 on an Uno.
  uint8_t p = pin >= A0 ? pin : (uint8_t)(pin + A0);
  int8_t s = kiungo_sensor_for_pin(p);
  if (s < 0) return analogRead(pin);
  int32_t v = kiungo_sensor_value((uint8_t)s, 0);
  if (v < 0) v = 0;
  if (v > 1023) v = 1023;
  return (int)v;
}

// A virtual pulse: the pushed value is the pulse length in microseconds.
unsigned long kiungo_pulseIn(uint8_t pin, uint8_t state, unsigned long timeout) {
  int8_t s = kiungo_sensor_for_pin(pin);
  if (s < 0) return pulseIn(pin, state, timeout);
  int32_t v = kiungo_sensor_value((uint8_t)s, 0);
  if (v < 0) return 0;
  if (timeout && (unsigned long)v > timeout) return 0;
  return (unsigned long)v;
}

unsigned long kiungo_pulseInLong(uint8_t pin, uint8_t state, unsigned long timeout) {
  if (kiungo_sensor_for_pin(pin) < 0) return pulseInLong(pin, state, timeout);
  return kiungo_pulseIn(pin, state, timeout);
}

// ----- the user's Serial -----
KiungoSerial kiungoSerial;

// The link is already running (initVariant): the sketch's baud rate doesn't apply to it.
void KiungoSerial::begin(unsigned long) { startLink(); }
void KiungoSerial::begin(unsigned long, uint8_t) { startLink(); }
// The link stays open: Kiungo needs it after the sketch is done with Serial.
void KiungoSerial::end() { flush(); }

int KiungoSerial::available() {
  kiungo_poll();
  return inCount();
}

int KiungoSerial::peek() {
  kiungo_poll();
  return inCount() ? inBuf[inTail & (sizeof(inBuf) - 1)] : -1;
}

int KiungoSerial::read() {
  kiungo_poll();
  return inCount() ? inBuf[inTail++ & (sizeof(inBuf) - 1)] : -1;
}

int KiungoSerial::availableForWrite() { return sizeof(out_) - outLen_; }

void KiungoSerial::flush() {
  if (outLen_ == 0) return;
  kiungo_send(KIUNGO_TEXT, out_, outLen_);
  outLen_ = 0;
}

size_t KiungoSerial::write(uint8_t c) {
  out_[outLen_++] = c;
  if (c == '\n' || outLen_ >= sizeof(out_)) flush();
  return 1;
}

size_t KiungoSerial::write(const uint8_t* buffer, size_t size) {
  for (size_t i = 0; i < size; i++) write(buffer[i]);
  return size;
}
