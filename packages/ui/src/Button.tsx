import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "danger";
}

export function Button({ variant = "default", style, ...rest }: ButtonProps) {
  return (
    <button
      style={{
        padding: "6px 14px",
        borderRadius: 6,
        border: "1px solid #888",
        background: variant === "danger" ? "#c62828" : "#f5f5f5",
        color: variant === "danger" ? "#fff" : "#111",
        cursor: "pointer",
        ...style,
      }}
      {...rest}
    />
  );
}
