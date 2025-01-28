import { useState } from "react";
import {
  MIN_BONUS,
  MAX_BONUS,
  FIFTEEN_MINUTES,
  ONE_DAY,
} from "../utils/constants";
import { getSecureRandom, getSecureRandomInt } from "../utils/random";
import { logger } from "../utils/logger";

interface UseBonusSystemReturn {
  currentBonus: number;
  remainingBonusClaims: number;
  checkAndActivateBonus: () => void;
  decrementBonusClaims: () => void;
}

export function useBonusSystem(): UseBonusSystemReturn {
  const [currentBonus, setCurrentBonus] = useState<number>(0);
  const [remainingBonusClaims, setRemainingBonusClaims] = useState<number>(0);
  const [lastBonusTime, setLastBonusTime] = useState<number>(0);

  const checkAndActivateBonus = () => {
    const now = Date.now();
    const timeSinceLastBonus = now - lastBonusTime;

    const canActivateBonus =
      remainingBonusClaims === 0 &&
      timeSinceLastBonus >= FIFTEEN_MINUTES &&
      getSecureRandom() < 0.01 && // 1% chance with true randomness
      getSecureRandom() < timeSinceLastBonus / ONE_DAY;

    if (canActivateBonus) {
      const bonus = getSecureRandomInt(MIN_BONUS, MAX_BONUS);
      const claims = getSecureRandomInt(1, 21); // Random 1-21 claims with true randomness
      setCurrentBonus(bonus);
      setRemainingBonusClaims(claims);
      setLastBonusTime(now);
      logger.info(
        `Activated bonus: +${bonus} sats for next ${claims} claims! (After ${Math.floor(
          timeSinceLastBonus / 60000
        )} minutes)`
      );
    }
  };

  const decrementBonusClaims = () => {
    if (remainingBonusClaims > 0) {
      setRemainingBonusClaims((prev) => prev - 1);
      if (remainingBonusClaims === 1) {
        // Last bonus claim
        setCurrentBonus(0);
        logger.info("Bonus round completed!");
      }
    }
  };

  return {
    currentBonus,
    remainingBonusClaims,
    checkAndActivateBonus,
    decrementBonusClaims,
  };
}
