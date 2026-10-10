/**
 * Calculates responsive elliptical coordinates for seats 0 to (totalSeats - 1)
 * such that the Hero (active user) is always anchored at bottom-center (90 degrees / pi/2).
 */
export function getSeatCoordinates(seatIndex, totalSeats = 8, heroSeatIndex = 0) {
  // Rotate so Hero (active user) is always at bottom center (90 degrees / pi/2)
  const relativeIndex = (seatIndex - heroSeatIndex + totalSeats) % totalSeats;
  
  // Angle distribution around ellipse: 0 corresponds to bottom center (Hero)
  const angle = (2 * Math.PI * relativeIndex) / totalSeats + Math.PI / 2;
  
  // Ellipse radii in percentage of table container
  const radiusX = 42; // 42% from center horizontally
  const radiusY = 36; // 36% from center vertically
  
  const left = 50 + radiusX * Math.cos(angle);
  const top = 50 + radiusY * Math.sin(angle);
  
  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
    angle
  };
}
