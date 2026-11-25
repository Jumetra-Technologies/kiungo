/** A flat drawing of an Uno with its on-board "L" LED (pin 13), for the Sprint 1 check. */
export function UnoBoard({ ledOn }: { ledOn: boolean }) {
  return (
    <svg className="uno" viewBox="0 0 340 250" role="img" aria-label={`Arduino Uno, the L LED on pin 13 is ${ledOn ? "on" : "off"}`}>
      <rect x="4" y="4" width="332" height="242" rx="14" fill="#0f6c8f" />
      <rect x="4" y="4" width="332" height="242" rx="14" fill="none" stroke="rgba(255,255,255,.15)" />
      {/* USB-B and barrel jack */}
      <rect x="-6" y="34" width="62" height="54" rx="4" fill="#c9d3df" />
      <rect x="-2" y="168" width="52" height="48" rx="6" fill="#1b2633" />
      {/* digital header */}
      <rect x="120" y="14" width="200" height="16" rx="3" fill="#1b2633" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={126 + i * 13.6} y="19" width="6" height="6" fill="#d9b44a" />
      ))}
      <text x="296" y="44" fontSize="10" fill="#cfe9f5" fontFamily="var(--k-mono)">13</text>
      {/* the L LED */}
      {ledOn && <circle cx="141" cy="61" r="15" fill="#ff5a5a" opacity="0.45" />}
      <rect x="132" y="56" width="18" height="10" rx="2" fill={ledOn ? "#ff4040" : "#7c2b2b"} />
      <text x="156" y="65" fontSize="11" fontWeight="700" fill="#cfe9f5" fontFamily="var(--k-font)">L</text>
      {/* the chip */}
      <rect x="150" y="150" width="150" height="40" rx="3" fill="#1b2633" />
      <text x="170" y="174" fontSize="10" fill="#9fb3cf" fontFamily="var(--k-mono)">ATmega328P</text>
      {/* power and analog headers */}
      <rect x="110" y="222" width="90" height="14" rx="3" fill="#1b2633" />
      <rect x="216" y="222" width="90" height="14" rx="3" fill="#1b2633" />
      <text x="70" y="140" fontSize="20" fontWeight="800" fill="#e8f6fb" fontFamily="var(--k-font)">UNO</text>
    </svg>
  );
}
