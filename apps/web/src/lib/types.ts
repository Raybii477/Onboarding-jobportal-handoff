export type UserRole = "candidate" | "employee" | "reviewer" | "admin";
export type PostingVisibility = "public" | "internal" | "both";
export type PostingStatus = "draft" | "open" | "closed";
export type ApplicationStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";
export type CaseStatus = "in_progress" | "complete";
export type SubmissionStatus =
  | "pending"
  | "submitted"
  | "approved"
  | "rejected"
  | "resubmit_requested";

export interface Profile {
  user_id: string;
  role: UserRole;
  department: string | null;
  full_name: string;
  email: string;
}

export interface JobPosting {
  id: string;
  title: string;
  description: string;
  department: string | null;
  visibility: PostingVisibility;
  status: PostingStatus;
  created_by: string;
  created_at: string;
}

export interface Application {
  id: string;
  applicant_id: string;
  posting_id: string;
  resume_file_path: string | null;
  stage: ApplicationStage;
  referred_by: string | null;
  created_at: string;
  job_postings?: Pick<JobPosting, "title" | "department">;
  profiles?: Pick<Profile, "full_name" | "email">;
}

export interface OnboardingCase {
  id: string;
  new_hire_profile_id: string;
  source_application_id: string | null;
  status: CaseStatus;
  created_at: string;
  profiles?: Pick<Profile, "full_name" | "email">;
}

export interface DocumentType {
  id: string;
  name: string;
  description: string;
  required: boolean;
  sort_order: number;
}

/** One uploaded file. Several may be active on the same submission;
 *  earlier attempts are kept with `superseded_at` set. */
export interface DocumentFile {
  id: string;
  submission_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  superseded_at: string | null;
}

export interface DocumentSubmission {
  id: string;
  case_id: string;
  document_type_id: string;
  /** Pointer to the most recent file; the full set lives in document_files. */
  file_path: string | null;
  status: SubmissionStatus;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  document_types?: DocumentType;
  document_files?: DocumentFile[];
}

export function activeFiles(s: DocumentSubmission): DocumentFile[] {
  return (s.document_files ?? [])
    .filter((f) => !f.superseded_at)
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
}

export function supersededFiles(s: DocumentSubmission): DocumentFile[] {
  return (s.document_files ?? [])
    .filter((f) => f.superseded_at)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STAGES: ApplicationStage[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];
