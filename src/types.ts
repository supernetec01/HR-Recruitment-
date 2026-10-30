export type User = { id: string; name: string; username?: string; email?: string; role: 'hr' | 'boss' | 'admin' | 'interviewer'; active?: boolean; is_demo?: number };
export type Job = {
  id: string; title: string; department: string; location: string; employment_type: string; description: string;
  openings: number; status?: string; application_count?: number; requirements?: string; benefits?: string;
  working_hours?: string; salary_range?: string; business_line?: string; application_deadline?: string;
  created_at?: string; updated_at?: string; revision?: number;
  company_name?: string; application_instructions?: string; application_email?: string; application_email_subject?: string; application_zalo?: string;
};
export type Application = { id: string; job_id: string; job_title: string; department: string; stage: string; source: string; received_at: string; created_at: string };
export type Document = { id: string; original_name: string; size: number; version: number; mime_type: string; review_status: string; created_at: string; kind: string };
export type Candidate = {
  id: string; full_name: string; email: string; phone: string; location: string; source: string;
  created_by: string; creator_name: string; received_at: string; created_at: string; updated_at: string;
  owner_id: string | null; owner_name: string | null; notes: string; tags: string[]; portfolio: string;
  consent_status: string; consent_at: string | null; consent_version: string | null;
  applications: Application[]; documents: Document[]; complete: boolean; missing: string[];
};
export type Interview = { id: string; candidate_id: string; candidate_name: string; application_id: string; job_title: string; interviewer_id: string; interviewer_name: string; starts_at: string; ends_at: string; duration_minutes?: number; mode: string; location: string; status: string; request_id?: string | null; contact_evidence?: string; contacted_at?: string | null; contacted_by?: string | null };
export type InterviewRequest = { id: string; application_id: string; candidate_id: string; candidate_name: string; email: string; phone: string; owner_name: string | null; job_title: string; document_id: string; document_name: string; document_version: number; document_review_status?: string; requested_by: string; requested_by_name: string; preferred_interviewer_id?: string | null; preferred_interviewer_name?: string | null; notes: string; status: 'pending' | 'scheduled' | 'cancelled'; created_at: string; interview_id: string | null };
export type Match = { id: string; full_name: string; email: string; phone: string; source: string };
export type Submission = { id: string; created_at: string; payload: { fullName: string; email: string; phone: string; jobId: string; source: string }; matches: Match[]; documents: Document[] };
export type Detail = Candidate & {
  history: { id: string; action: string; actor_name: string; created_at: string; details: Record<string, unknown> }[];
  links: { token_hash: string; created_at: string; expires_at: string; used_at: string | null; revoked_at: string | null }[];
  interviews: Interview[];
};
