import { resolveFactCard } from "../resolve";
import type { ConflictResolver } from "../interfaces";

export class DefaultConflictResolver implements ConflictResolver {
  resolve(
    input: Parameters<ConflictResolver["resolve"]>[0],
  ): ReturnType<ConflictResolver["resolve"]> {
    return resolveFactCard(input);
  }
}
