import type { Candidate } from './types';

export const isNewCandidate = (candidate: Candidate) => !candidate.applications.length || candidate.applications.some(application => application.stage === 'new');
export function candidateReceivedAt(candidate: Candidate) {
  return Math.max(Date.parse(candidate.received_at), ...candidate.applications.map(application => Date.parse(application.received_at)));
}
export function compareCandidates(sort: string) {
  return (a: Candidate, b: Candidate) => {
    const priority = sort === 'priority' ? Number(isNewCandidate(b)) - Number(isNewCandidate(a)) : 0;
    const received = candidateReceivedAt(b) - candidateReceivedAt(a);
    return priority || (sort === 'oldest' ? -received : received) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
  };
}
