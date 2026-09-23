import { scoreConfidence } from "../confidence";
import type { ConfidenceScorer } from "../interfaces";

export class DefaultConfidenceScorer implements ConfidenceScorer {
  score(input: Parameters<ConfidenceScorer["score"]>[0]): number {
    return scoreConfidence(input);
  }
}
