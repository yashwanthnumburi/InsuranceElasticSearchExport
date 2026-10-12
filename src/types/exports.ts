export interface ExportRequest {
  filters?: {
    claimStatus?: string;
    policyType?: string;
  };
}

export interface SearchAfterResponse<T> {
  documents: T[];
  searchAfter?: unknown[];
}
