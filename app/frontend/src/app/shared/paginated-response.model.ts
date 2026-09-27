export interface PaginatedResponse<T> {
  totalRecords: number;
  page: number;
  pageSize: number;
  items: T[];
}