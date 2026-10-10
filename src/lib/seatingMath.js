/**
 * Calculates responsive elliptical coordinates for seats 0 to (totalSeats - 1)
 * such that players are positioned on the OUTER edge / rail of the poker table,
 * leaving the green velvet felt 100% clean, uncluttered, and spacious.
 */
export function getSeatCoordinates(seatIndex, totalSeats = 6, heroSeatIndex = 0) {
  // Rotate so Hero (active user) is always anchored at bottom center (90 degrees / pi/2)
  const relativeIndex = (seatIndex - heroSeatIndex + totalSeats) % totalSeats;
  
  // Angle distribution around ellipse: 0 corresponds to bottom center (Hero)
  const angle = (2 * Math.PI * relativeIndex) / totalSeats + Math.PI / 2;
  
  // Ellipse radii positioned along the OUTER edge / rail of the table
  const radiusX = 47.5; // Sits along outer bumper without overflowing screen
  const radiusY = 46.5; // Sits neatly along outer rail cushion without hanging too far below
  
  const left = 50 + radiusX * Math.cos(angle);
  const top = 50 + radiusY * Math.sin(angle);
  
  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
    angle
  };
}
