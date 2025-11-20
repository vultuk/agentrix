import React from "react";

type Props = {
  width: number;
  onMouseDown: (event: React.MouseEvent) => void;
};

export function ResizeHandle({ width, onMouseDown }: Props) {
  return (
    <div
      className="relative cursor-col-resize bg-transparent"
      style={{ width }}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    />
  );
}
