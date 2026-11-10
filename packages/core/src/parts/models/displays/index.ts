import { type PartModel } from "../../types";
import { LCD_16X2 } from "./lcd-16x2";
import { OLED_SSD1306 } from "./oled-ssd1306";
import { TFT_DISPLAY } from "./tft-display";

export const DISPLAYS: PartModel[] = [LCD_16X2, OLED_SSD1306, TFT_DISPLAY];
