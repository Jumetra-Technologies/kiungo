import { type PartModel } from "../../types";
import { ARDUINO_UNO } from "../arduino-uno";
import { ESP32 } from "./esp32";
import { RASPBERRY_PI_PICO } from "./raspberry-pi-pico";
import { ARDUINO_MEGA } from "./arduino-mega";
import { ESP8266 } from "./esp8266";
import { STM32 } from "./stm32";
import { RASPBERRY_PI_4 } from "./raspberry-pi-4";
import { MICROBIT } from "./microbit";
import { TEENSY } from "./teensy";

export const BOARDS: PartModel[] = [
  ARDUINO_UNO,
  ESP32,
  RASPBERRY_PI_PICO,
  ARDUINO_MEGA,
  ESP8266,
  STM32,
  RASPBERRY_PI_4,
  MICROBIT,
  TEENSY,
];
