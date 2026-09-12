import type { QueryResult, QueryResultRow } from "pg";

export interface PgClientLike {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
  release(): void;
}

export interface PgPoolLike {
  connect(): Promise<PgClientLike>;
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
}
