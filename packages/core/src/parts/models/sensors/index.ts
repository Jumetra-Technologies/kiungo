import { type PartModel } from "../../types";
import { DHT11 } from "./dht11";
import { HC_SR04 } from "./hc-sr04";
import { PIR } from "./pir";
import { DHT22 } from "./dht22";
import { AM2302 } from "./am2302";
import { LDR } from "./ldr";
import { DS18B20 } from "./ds18b20";
import { SOIL_MOISTURE } from "./soil-moisture";
import { MQ2 } from "./mq2";
import { MPU6050 } from "./mpu6050";
import { BMP280 } from "./bmp280";

export const SENSORS: PartModel[] = [
  DHT11,
  HC_SR04,
  PIR,
  DHT22,
  AM2302,
  LDR,
  DS18B20,
  SOIL_MOISTURE,
  MQ2,
  MPU6050,
  BMP280,
];
