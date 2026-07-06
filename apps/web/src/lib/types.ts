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

export interface DocumentSubmission {
  id: string;
  case_id: string;
  document_type_id: string;
  file_path: string | null;
  status: SubmissionStatus;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  document_types?: DocumentType;
}

export const STAGES: ApplicationStage[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];
