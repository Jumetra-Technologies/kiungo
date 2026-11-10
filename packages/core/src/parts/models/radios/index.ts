import { type PartModel } from "../../types";
import { HC_05 } from "./hc-05";
import { WIFI_MODULE } from "./wifi-module";
import { NRF24L01 } from "./nrf24l01";
import { LORA } from "./lora";

export const RADIOS: PartModel[] = [HC_05, WIFI_MODULE, NRF24L01, LORA];
