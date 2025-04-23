export interface ReportWhereClause {
  app: string;
  xref: string;
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
}