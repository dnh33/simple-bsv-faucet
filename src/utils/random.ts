/**
 * Generates a cryptographically secure random number between 0 and 1
 * @returns number between 0 and 1
 */
export const getSecureRandom = (): number => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / (0xffffffff + 1);
};

/**
 * Generates a cryptographically secure random integer between min and max (inclusive)
 * @param min minimum value (inclusive)
 * @param max maximum value (inclusive)
 * @returns random integer between min and max
 */
export const getSecureRandomInt = (min: number, max: number): number => {
  return Math.floor(getSecureRandom() * (max - min + 1)) + min;
};
