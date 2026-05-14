import { runValidatorContract } from "@viki/ports/contracts";
import { defaultValidator } from "../index.js";

runValidatorContract(() => defaultValidator);
