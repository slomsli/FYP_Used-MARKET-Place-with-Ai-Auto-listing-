export type IdentityVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'resubmission_required';

export type IdentityRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'resubmission_required';

export type IdentityDocumentType = 'passport' | 'national_id' | 'driving_license' | 'other';

export interface VerificationProfileStatus {
  identityVerificationStatus: IdentityVerificationStatus;
  identityVerificationBadge: boolean;
  identityVerifiedAt: string | null;
  identityVerifiedBy: string | null;
}

export interface UserVerificationRequestSummary {
  id: string;
  documentType: IdentityDocumentType;
  documentCountry: string | null;
  documentNumberLast4: string | null;
  status: IdentityRequestStatus;
  userNotes: string | null;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserVerificationResponse {
  profile: VerificationProfileStatus;
  latestRequest: UserVerificationRequestSummary | null;
}

export interface AdminVerificationUserSummary {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  avatarPath: string | null;
  role: string;
  identityVerificationStatus: IdentityVerificationStatus;
  identityVerificationBadge: boolean;
}

export interface AdminVerificationRequestListItem {
  id: string;
  userId: string;
  documentType: IdentityDocumentType;
  documentCountry: string | null;
  documentNumberLast4: string | null;
  status: IdentityRequestStatus;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  user: AdminVerificationUserSummary;
}

export interface AdminVerificationRequestsResponse {
  filters: {
    status: IdentityRequestStatus | 'all';
  };
  counts: Record<IdentityRequestStatus, number>;
  requests: AdminVerificationRequestListItem[];
}

export interface AdminVerificationRequestDetail extends AdminVerificationRequestListItem {
  userNotes: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedBy: AdminVerificationUserSummary | null;
  images: {
    selfieSignedUrl: string;
    documentFrontSignedUrl: string;
    expiresInSeconds: number;
  };
}
