import { projectFactCardToReport } from "../report";
import type { ReportGenerator } from "../interfaces";
import type { PropertyFactCard } from "../types";

export class DefaultReportGenerator implements ReportGenerator {
  fromFactCard(card: PropertyFactCard) {
    return projectFactCardToReport(card);
  }
}
