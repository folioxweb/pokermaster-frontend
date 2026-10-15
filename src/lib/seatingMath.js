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
  // Radius Y calibration:
  // - Top seat(s) (sin(angle) < -0.5, e.g. relativeIndex === 3 in 6-max): 41.5% so cards sit cleanly on top rail with generous breathing room below the header
  // - Hero (relativeIndex === 0, bottom center): 43.5% so hero box and ring sit nicely on bottom rail
  // - Side seats: 45.0% for balanced oval rail placement
  let radiusY = 45.0;
  if (Math.sin(angle) < -0.5) {
    radiusY = 41.5;
  } else if (relativeIndex === 0) {
    radiusY = 43.5;
  }
  
  const left = 50 + radiusX * Math.cos(angle);
  const top = 50 + radiusY * Math.sin(angle);
  
  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
    angle
  };
}
