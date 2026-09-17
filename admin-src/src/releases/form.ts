import type { ProgramTestView } from "../types";
import { secondsToMinutes } from "../programs/ids";

export type ReleaseForm = {
  openAt: string;
  closeAt: string;
  maxTries: number;
  timeLimitMinutes: number;
};

export function formFromTest(test: ProgramTestView): ReleaseForm {
  return {
    openAt: test.openAt,
    closeAt: test.closeAt,
    maxTries: test.maxTries,
    timeLimitMinutes: secondsToMinutes(test.timeLimitSec),
  };
}
