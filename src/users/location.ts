/**
 * The home area is stored to about 100 metres (three decimal places), not to the doorstep:
 * ringer invites only need to know roughly how far a game is.
 */
export function coarsen(coordinate: number): number {
  return Math.round(coordinate * 1000) / 1000;
}
