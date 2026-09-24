export interface SourceRunStep {
  name: string;
  source_id?: string;
  media_id?: string;
  media?: string;
  source_url?: string | null;
  source_type?: string;
  crawl_method?: string;
  status?: string;
  articles?: number;
  error_code?: string;
  error?: string;
}

export function summarizeSourceSteps(steps: SourceRunStep[]) {
  const fetchSteps = steps.filter(step => step.name === 'media_fetch');
  // Old journals have only media names. Do not relabel their task counts as verified sources.
  const sourceIdentityVerified = fetchSteps.length > 0 && fetchSteps.every(step =>
    step.source_id && step.media_id && step.source_type && step.crawl_method);
  const bySource = new Map(fetchSteps.filter(step => step.source_id).map(step => [step.source_id, step]));
  const sources = [...bySource.values()];
  const countMedia = (status: string) => new Set((sourceIdentityVerified ? sources : fetchSteps).filter(step => step.status === status)
    .map(step => step.media_id ?? step.media).filter(Boolean)).size;
  return {
    sourceIdentityVerified,
    successfulSources: sourceIdentityVerified ? sources.filter(step => step.status === 'success').length : null,
    failedSources: sourceIdentityVerified ? sources.filter(step => step.status === 'failed').length : null,
    successfulTasks: fetchSteps.filter(step => step.status === 'success').length,
    failedTasks: fetchSteps.filter(step => step.status === 'failed').length,
    successfulMedia: countMedia('success'),
    failedMedia: countMedia('failed'),
    articles: (sourceIdentityVerified ? sources : fetchSteps).reduce((n, step) => n + (step.articles ?? 0), 0),
    sources: sources.map(step => ({
      source_id: step.source_id, media_id: step.media_id, source_url: step.source_url,
      source_type: step.source_type, crawl_method: step.crawl_method,
      status: step.status, error_code: step.error_code, error: step.error,
    })),
  };
}
