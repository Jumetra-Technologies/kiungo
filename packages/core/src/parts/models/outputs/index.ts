import { type PartModel } from "../../types";
import { LED } from "./led";
import { RGB_LED } from "./rgb-led";
import { BUZZER } from "./buzzer";
import { SERVO } from "./servo";
import { DC_MOTOR } from "./dc-motor";
import { RELAY } from "./relay";
import { STEPPER_MOTOR } from "./stepper-motor";

export const OUTPUTS: PartModel[] = [LED, RGB_LED, BUZZER, SERVO, DC_MOTOR, RELAY, STEPPER_MOTOR];
