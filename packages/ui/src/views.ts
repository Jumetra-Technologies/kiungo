/**
 * The three ways Kiungo draws a part or a build, named once so the lab, the
 * Component library and the Inspector all say the same thing.
 */
export const VIEW_COPY = {
  "3d": {
    label: "3D",
    description: "3D: the parts as they sit on the bench",
    info: "The parts as they look on your bench, drawn to scale. Use it to recognize each part and see how the build will look before you wire it for real.",
  },
  "2d": {
    label: "2D",
    description: "2D: a flat view from above with every pin labeled",
    info: "A flat view from above with every pin, port and LED labeled. Use it to wire parts and check exactly which pin goes where.",
  },
  trace: {
    label: "Trace",
    description: "Trace: follow the current through the circuit",
    info: "Follows the current and data through the circuit while it runs. Where the flow stops is where the circuit is broken, so start debugging here.",
  },
} as const;
