import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { createNotification, createNotifications } from './notificationService';
import { isAccountSuspended } from '../utils/accountStatus';
import { getPublicStorageUrl } from '../utils/storage';
import { AVATAR_BUCKET, IDENTITY_VERIFICATION_BUCKET } from '../utils/storageBuckets';

export const IDENTITY_VERIFICATION_STATUSES = [
  'unverified',
  'pending',
  'verified',
  'rejected',
  'resubmission_required',
] as const;

export const IDENTITY_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'resubmission_required',
] as const;

export const IDENTITY_DOCUMENT_TYPES = [
  'passport',
  'national_id',
  'driving_license',
  'other',
] as const;

export type IdentityVerificationStatus = (typeof IDENTITY_VERIFICATION_STATUSES)[number];
export type IdentityRequestStatus = (typeof IDENTITY_REQUEST_STATUSES)[number];
export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number];

export interface IdentityVerificationUpload {
  fileName: string;
  contentType: string;
  size: number;
  buffer: Buffer;
}

export interface ApplyIdentityVerificationInput {
  userId: string;
  documentType: string | null;
  documentCountry?: string | null;
  documentNumberLast4?: string | null;
  userNotes?: string | null;
  consent: boolean;
  selfie: IdentityVerificationUpload | null;
  documentFront: IdentityVerificationUpload | null;
}

export interface AdminVerificationDecisionInput {
  adminUserId: string;
  requestId: string;
  rejectionReason?: string | null;
  adminNotes?: string | null;
}

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

export class VerificationServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'VerificationServiceError';
    this.status = status;
  }
}

type RawProfile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
  role: string;
  identity_verification_status: IdentityVerificationStatus | null;
  identity_verification_badge: boolean | null;
  identity_verified_at?: string | null;
  identity_verified_by?: string | null;
};

type RawVerificationRequest = {
  id: string;
  user_id: string;
  document_type: IdentityDocumentType;
  document_country: string | null;
  document_number_last4: string | null;
  selfie_storage_path: string;
  document_front_storage_path: string;
  status: IdentityRequestStatus;
  user_notes: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RawAuthUser = {
  email?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  app_metadata?: {
    account_status?: unknown;
    [key: string]: unknown;
  } | null;
};

const MAX_IDENTITY_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_IDENTITY_MULTIPART_BYTES = MAX_IDENTITY_FILE_SIZE_BYTES * 2 + 1024 * 1024;
const SIGNED_URL_EXPIRES_IN_SECONDS = 5 * 60;
const IDENTITY_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXTENSION_BY_MIME_TYPE: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

let identityBucketPromise: Promise<void> | null = null;

function trimOptional(value: string | null | undefined, maxLength?: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function buildDisplayName(profile: Pick<RawProfile, 'full_name' | 'username'>): string {
  return profile.full_name?.trim() || profile.username || 'Marketplace User';
}

function hasVerifiedBadge(profile: Pick<RawProfile, 'identity_verification_status' | 'identity_verification_badge'>): boolean {
  return profile.identity_verification_status === 'verified' && profile.identity_verification_badge === true;
}

function mapProfileStatus(profile: RawProfile | null | undefined): VerificationProfileStatus {
  return {
    identityVerificationStatus: profile?.identity_verification_status ?? 'unverified',
    identityVerificationBadge: profile ? hasVerifiedBadge(profile) : false,
    identityVerifiedAt: profile?.identity_verified_at ?? null,
    identityVerifiedBy: profile?.identity_verified_by ?? null,
  };
}

function mapUserRequest(row: RawVerificationRequest): UserVerificationRequestSummary {
  return {
    id: row.id,
    documentType: row.document_type,
    documentCountry: row.document_country,
    documentNumberLast4: row.document_number_last4,
    status: row.status,
    userNotes: row.user_notes,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdminUser(profile: RawProfile, email: string | null): AdminVerificationUserSummary {
  return {
    id: profile.id,
    fullName: buildDisplayName(profile),
    username: profile.username,
    email,
    avatarPath: getPublicStorageUrl(AVATAR_BUCKET, profile.avatar_path),
    role: profile.role,
    identityVerificationStatus: profile.identity_verification_status ?? 'unverified',
    identityVerificationBadge: hasVerifiedBadge(profile),
  };
}

function mapAdminRequestListItem(
  row: RawVerificationRequest,
  user: AdminVerificationUserSummary
): AdminVerificationRequestListItem {
  return {
    id: row.id,
    userId: row.user_id,
    documentType: row.document_type,
    documentCountry: row.document_country,
    documentNumberLast4: row.document_number_last4,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    user,
  };
}

function normalizeRequestStatus(value: string | null | undefined): IdentityRequestStatus | 'all' {
  if (!value || value === 'all') {
    return 'all';
  }

  if (IDENTITY_REQUEST_STATUSES.includes(value as IdentityRequestStatus)) {
    return value as IdentityRequestStatus;
  }

  throw new VerificationServiceError('Unsupported verification request status filter', 422);
}

function normalizeDocumentType(value: string | null): IdentityDocumentType {
  if (!value) {
    throw new VerificationServiceError('Document type is required', 422);
  }

  if (!IDENTITY_DOCUMENT_TYPES.includes(value as IdentityDocumentType)) {
    throw new VerificationServiceError('Unsupported document type', 422);
  }

  return value as IdentityDocumentType;
}

function normalizeDocumentNumberLast4(value: string | null | undefined): string | null {
  const trimmed = trimOptional(value);

  if (!trimmed) {
    return null;
  }

  if (!/^[0-9]{4}$/.test(trimmed)) {
    throw new VerificationServiceError('Document number must include only the last 4 digits', 422);
  }

  return trimmed;
}

function normalizeImageUpload(upload: IdentityVerificationUpload | null, label: string): {
  contentType: string;
  extension: string;
  buffer: Buffer;
} {
  if (!upload) {
    throw new VerificationServiceError(`${label} image is required`, 422);
  }

  const contentType = upload.contentType.toLowerCase();
  const extension = EXTENSION_BY_MIME_TYPE[contentType];

  if (!extension || !IDENTITY_IMAGE_MIME_TYPES.includes(contentType)) {
    throw new VerificationServiceError('Only JPG, PNG, and WEBP images are accepted', 422);
  }

  if (upload.size <= 0 || upload.buffer.length <= 0) {
    throw new VerificationServiceError(`${label} image is empty`, 422);
  }

  if (upload.size > MAX_IDENTITY_FILE_SIZE_BYTES || upload.buffer.length > MAX_IDENTITY_FILE_SIZE_BYTES) {
    throw new VerificationServiceError('Each identity image must be 8 MB or smaller', 413);
  }

  return {
    contentType,
    extension,
    buffer: upload.buffer,
  };
}

function objectPathFromStoredPath(storedPath: string): string {
  const prefix = `${IDENTITY_VERIFICATION_BUCKET}/`;
  return storedPath.startsWith(prefix) ? storedPath.slice(prefix.length) : storedPath;
}

function buildStoredPath(
  userId: string,
  requestId: string,
  fileName: 'selfie' | 'document-front',
  extension: string
): string {
  return `${IDENTITY_VERIFICATION_BUCKET}/${userId}/${requestId}/${fileName}.${extension}`;
}

async function ensureIdentityBucket(): Promise<void> {
  if (!identityBucketPromise) {
    identityBucketPromise = (async () => {
      const bucketResult = await supabaseAdmin.storage.getBucket(IDENTITY_VERIFICATION_BUCKET);
      const bucketOptions = {
        public: false,
        fileSizeLimit: MAX_IDENTITY_FILE_SIZE_BYTES,
        allowedMimeTypes: IDENTITY_IMAGE_MIME_TYPES,
      };

      if (bucketResult.data) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          IDENTITY_VERIFICATION_BUCKET,
          bucketOptions
        );

        if (updateError) {
          console.error('[Verification] Failed to update identity bucket:', updateError);
          throw new VerificationServiceError('Unable to prepare identity verification storage', 500);
        }

        return;
      }

      const bucketErrorMessage = bucketResult.error?.message ?? '';
      const isMissingBucketError = /not found|does not exist|404/i.test(bucketErrorMessage);
      if (bucketResult.error && !isMissingBucketError) {
        console.error('[Verification] Failed to inspect identity bucket:', bucketResult.error);
        throw new VerificationServiceError('Unable to prepare identity verification storage', 500);
      }

      const { error: createError } = await supabaseAdmin.storage.createBucket(
        IDENTITY_VERIFICATION_BUCKET,
        bucketOptions
      );

      if (createError && !/already exists/i.test(createError.message)) {
        console.error('[Verification] Failed to create identity bucket:', createError);
        throw new VerificationServiceError('Unable to prepare identity verification storage', 500);
      }
    })().catch((error) => {
      identityBucketPromise = null;
      throw error;
    });
  }

  return identityBucketPromise;
}

async function getAuthEmailMap(userIds: string[]): Promise<Map<string, string | null>> {
  const emailMap = new Map<string, string | null>();

  await Promise.all(
    Array.from(new Set(userIds.filter(Boolean))).map(async (userId) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      emailMap.set(userId, data.user?.email ?? null);
    })
  );

  return emailMap;
}

async function getProfilesByIds(userIds: string[]): Promise<Map<string, RawProfile>> {
  const profileMap = new Map<string, RawProfile>();
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return profileMap;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id,
      username,
      full_name,
      avatar_path,
      role,
      identity_verification_status,
      identity_verification_badge,
      identity_verified_at,
      identity_verified_by
    `)
    .in('id', uniqueUserIds);

  if (error) {
    console.error('[Verification] Failed to fetch profiles:', error);
    throw new VerificationServiceError('Unable to load verification user details', 500);
  }

  for (const profile of (data ?? []) as RawProfile[]) {
    profileMap.set(profile.id, profile);
  }

  return profileMap;
}

async function getProfileForVerification(userId: string): Promise<RawProfile> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id,
      username,
      full_name,
      avatar_path,
      role,
      identity_verification_status,
      identity_verification_badge,
      identity_verified_at,
      identity_verified_by
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Verification] Failed to fetch profile:', error);
    throw new VerificationServiceError('Unable to load verification status', 500);
  }

  if (!data) {
    throw new VerificationServiceError('Profile not found', 404);
  }

  return data as RawProfile;
}

async function notifyAdminsOfNewVerificationRequest(
  profile: RawProfile,
  requestId: string
): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');

    if (error) {
      console.error('[Verification] Failed to load admins for verification notification:', error);
      return;
    }

    const adminIds = ((data ?? []) as Array<{ id: string }>).map((admin) => admin.id);

    if (adminIds.length === 0) {
      return;
    }

    const displayName = buildDisplayName(profile);

    await createNotifications(
      adminIds.map((adminId) => ({
        userId: adminId,
        type: 'system',
        title: 'New identity verification request',
        body: `${displayName} submitted documents for ReMarket Verified review.`,
        linkPath: `/admin/verification?requestId=${requestId}`,
      }))
    );
  } catch (error) {
    console.error('[Verification] Failed to notify admins about verification request:', error);
  }
}

export async function getMyVerification(userId: string): Promise<UserVerificationResponse> {
  const [profile, latestRequestResult] = await Promise.all([
    getProfileForVerification(userId),
    supabaseAdmin
      .from('identity_verification_requests')
      .select(`
        id,
        user_id,
        document_type,
        document_country,
        document_number_last4,
        selfie_storage_path,
        document_front_storage_path,
        status,
        user_notes,
        admin_notes,
        rejection_reason,
        reviewed_by,
        submitted_at,
        reviewed_at,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestRequestResult.error) {
    console.error('[Verification] Failed to fetch latest request:', latestRequestResult.error);
    throw new VerificationServiceError('Unable to load verification request', 500);
  }

  return {
    profile: mapProfileStatus(profile),
    latestRequest: latestRequestResult.data
      ? mapUserRequest(latestRequestResult.data as RawVerificationRequest)
      : null,
  };
}

export async function applyForIdentityVerification(
  input: ApplyIdentityVerificationInput
): Promise<UserVerificationResponse> {
  if (!input.consent) {
    throw new VerificationServiceError('Consent is required before submitting documents', 422);
  }

  const documentType = normalizeDocumentType(input.documentType);
  const documentCountry = trimOptional(input.documentCountry, 80);
  const documentNumberLast4 = normalizeDocumentNumberLast4(input.documentNumberLast4);
  const userNotes = trimOptional(input.userNotes, 1000);
  const selfie = normalizeImageUpload(input.selfie, 'Selfie');
  const documentFront = normalizeImageUpload(input.documentFront, 'Document front');

  const [profile, authUserResult, pendingRequestResult] = await Promise.all([
    getProfileForVerification(input.userId),
    supabaseAdmin.auth.admin.getUserById(input.userId),
    supabaseAdmin
      .from('identity_verification_requests')
      .select('id')
      .eq('user_id', input.userId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
  ]);

  if (authUserResult.error) {
    console.error('[Verification] Failed to inspect account status:', authUserResult.error);
    throw new VerificationServiceError('Unable to verify account status', 500);
  }

  if (isAccountSuspended(authUserResult.data.user as RawAuthUser | undefined)) {
    throw new VerificationServiceError('Suspended accounts cannot submit verification requests', 403);
  }

  if (pendingRequestResult.error) {
    console.error('[Verification] Failed to inspect pending requests:', pendingRequestResult.error);
    throw new VerificationServiceError('Unable to inspect existing verification requests', 500);
  }

  if (pendingRequestResult.data || profile.identity_verification_status === 'pending') {
    throw new VerificationServiceError('You already have a pending verification request', 409);
  }

  if (profile.identity_verification_status === 'verified') {
    throw new VerificationServiceError('This account is already ReMarket Verified', 409);
  }

  await ensureIdentityBucket();

  const requestId = randomUUID();
  const selfieStoredPath = buildStoredPath(input.userId, requestId, 'selfie', selfie.extension);
  const documentStoredPath = buildStoredPath(
    input.userId,
    requestId,
    'document-front',
    documentFront.extension
  );
  const uploadedObjectPaths: string[] = [];

  try {
    const selfieObjectPath = objectPathFromStoredPath(selfieStoredPath);
    const { error: selfieUploadError } = await supabaseAdmin.storage
      .from(IDENTITY_VERIFICATION_BUCKET)
      .upload(selfieObjectPath, selfie.buffer, {
        contentType: selfie.contentType,
        upsert: false,
      });

    if (selfieUploadError) {
      console.error('[Verification] Failed to upload selfie:', selfieUploadError);
      throw new VerificationServiceError('Unable to upload selfie image', 500);
    }
    uploadedObjectPaths.push(selfieObjectPath);

    const documentObjectPath = objectPathFromStoredPath(documentStoredPath);
    const { error: documentUploadError } = await supabaseAdmin.storage
      .from(IDENTITY_VERIFICATION_BUCKET)
      .upload(documentObjectPath, documentFront.buffer, {
        contentType: documentFront.contentType,
        upsert: false,
      });

    if (documentUploadError) {
      console.error('[Verification] Failed to upload document image:', documentUploadError);
      throw new VerificationServiceError('Unable to upload document image', 500);
    }
    uploadedObjectPaths.push(documentObjectPath);

    const { error: insertError } = await supabaseAdmin
      .from('identity_verification_requests')
      .insert({
        id: requestId,
        user_id: input.userId,
        document_type: documentType,
        document_country: documentCountry,
        document_number_last4: documentNumberLast4,
        selfie_storage_path: selfieStoredPath,
        document_front_storage_path: documentStoredPath,
        status: 'pending',
        user_notes: userNotes,
      });

    if (insertError) {
      console.error('[Verification] Failed to create verification request:', insertError);
      throw new VerificationServiceError('Unable to submit verification request', 500);
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        identity_verification_status: 'pending',
        identity_verification_badge: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId);

    if (profileUpdateError) {
      console.error('[Verification] Failed to mark profile pending:', profileUpdateError);
      throw new VerificationServiceError('Unable to update verification status', 500);
    }
  } catch (error) {
    if (uploadedObjectPaths.length > 0) {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from(IDENTITY_VERIFICATION_BUCKET)
        .remove(uploadedObjectPaths);

      if (cleanupError) {
        console.error('[Verification] Failed to clean up uploaded identity files:', cleanupError);
      }
    }

    throw error;
  }

  await notifyAdminsOfNewVerificationRequest(profile, requestId);

  return getMyVerification(input.userId);
}

export async function getAdminVerificationRequests(
  statusFilter?: string
): Promise<AdminVerificationRequestsResponse> {
  const status = normalizeRequestStatus(statusFilter);

  let requestQuery = supabaseAdmin
    .from('identity_verification_requests')
    .select(`
      id,
      user_id,
      document_type,
      document_country,
      document_number_last4,
      selfie_storage_path,
      document_front_storage_path,
      status,
      user_notes,
      admin_notes,
      rejection_reason,
      reviewed_by,
      submitted_at,
      reviewed_at,
      created_at,
      updated_at
    `)
    .order('submitted_at', { ascending: false })
    .limit(100);

  if (status !== 'all') {
    requestQuery = requestQuery.eq('status', status);
  }

  const [requestsResult, countsResults] = await Promise.all([
    requestQuery,
    Promise.all(
      IDENTITY_REQUEST_STATUSES.map(async (requestStatus) => {
        const { count, error } = await supabaseAdmin
          .from('identity_verification_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', requestStatus);

        if (error) {
          throw error;
        }

        return [requestStatus, count ?? 0] as const;
      })
    ),
  ]);

  if (requestsResult.error) {
    console.error('[Verification] Failed to load admin requests:', requestsResult.error);
    throw new VerificationServiceError('Unable to load verification requests', 500);
  }

  const rows = (requestsResult.data ?? []) as RawVerificationRequest[];
  const userIds = rows.map((row) => row.user_id);
  const [profileMap, emailMap] = await Promise.all([
    getProfilesByIds(userIds),
    getAuthEmailMap(userIds),
  ]);

  const requests = rows.map((row) => {
    const profile = profileMap.get(row.user_id);

    if (!profile) {
      throw new VerificationServiceError('Verification request profile was not found', 500);
    }

    return mapAdminRequestListItem(row, mapAdminUser(profile, emailMap.get(row.user_id) ?? null));
  });

  return {
    filters: {
      status,
    },
    counts: Object.fromEntries(countsResults) as Record<IdentityRequestStatus, number>,
    requests,
  };
}

export async function getAdminVerificationRequestDetail(
  requestId: string
): Promise<AdminVerificationRequestDetail> {
  const normalizedRequestId = trimOptional(requestId);

  if (!normalizedRequestId) {
    throw new VerificationServiceError('Verification request ID is required', 422);
  }

  const { data, error } = await supabaseAdmin
    .from('identity_verification_requests')
    .select(`
      id,
      user_id,
      document_type,
      document_country,
      document_number_last4,
      selfie_storage_path,
      document_front_storage_path,
      status,
      user_notes,
      admin_notes,
      rejection_reason,
      reviewed_by,
      submitted_at,
      reviewed_at,
      created_at,
      updated_at
    `)
    .eq('id', normalizedRequestId)
    .maybeSingle();

  if (error) {
    console.error('[Verification] Failed to load request detail:', error);
    throw new VerificationServiceError('Unable to load verification request', 500);
  }

  if (!data) {
    throw new VerificationServiceError('Verification request not found', 404);
  }

  const request = data as RawVerificationRequest;
  const relatedProfileIds = [request.user_id, request.reviewed_by].filter(Boolean) as string[];
  const [profileMap, emailMap] = await Promise.all([
    getProfilesByIds(relatedProfileIds),
    getAuthEmailMap(relatedProfileIds),
  ]);
  const userProfile = profileMap.get(request.user_id);

  if (!userProfile) {
    throw new VerificationServiceError('Verification request profile was not found', 500);
  }

  const [selfieSignedUrl, documentSignedUrl] = await Promise.all([
    createSignedIdentityImageUrl(request.selfie_storage_path),
    createSignedIdentityImageUrl(request.document_front_storage_path),
  ]);

  const reviewedProfile = request.reviewed_by ? profileMap.get(request.reviewed_by) : null;
  const listItem = mapAdminRequestListItem(
    request,
    mapAdminUser(userProfile, emailMap.get(request.user_id) ?? null)
  );

  return {
    ...listItem,
    userNotes: request.user_notes,
    adminNotes: request.admin_notes,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    reviewedBy: reviewedProfile
      ? mapAdminUser(reviewedProfile, emailMap.get(reviewedProfile.id) ?? null)
      : null,
    images: {
      selfieSignedUrl,
      documentFrontSignedUrl: documentSignedUrl,
      expiresInSeconds: SIGNED_URL_EXPIRES_IN_SECONDS,
    },
  };
}

async function createSignedIdentityImageUrl(storedPath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(IDENTITY_VERIFICATION_BUCKET)
    .createSignedUrl(objectPathFromStoredPath(storedPath), SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('[Verification] Failed to create signed URL:', error);
    throw new VerificationServiceError('Unable to open identity document image', 500);
  }

  return data.signedUrl;
}

async function getRequestForDecision(requestId: string): Promise<RawVerificationRequest> {
  const normalizedRequestId = trimOptional(requestId);

  if (!normalizedRequestId) {
    throw new VerificationServiceError('Verification request ID is required', 422);
  }

  const { data, error } = await supabaseAdmin
    .from('identity_verification_requests')
    .select(`
      id,
      user_id,
      document_type,
      document_country,
      document_number_last4,
      selfie_storage_path,
      document_front_storage_path,
      status,
      user_notes,
      admin_notes,
      rejection_reason,
      reviewed_by,
      submitted_at,
      reviewed_at,
      created_at,
      updated_at
    `)
    .eq('id', normalizedRequestId)
    .maybeSingle();

  if (error) {
    console.error('[Verification] Failed to inspect request:', error);
    throw new VerificationServiceError('Unable to inspect verification request', 500);
  }

  if (!data) {
    throw new VerificationServiceError('Verification request not found', 404);
  }

  return data as RawVerificationRequest;
}

export async function approveVerificationRequest(
  input: AdminVerificationDecisionInput
): Promise<AdminVerificationRequestDetail> {
  const request = await getRequestForDecision(input.requestId);
  const reviewedAt = new Date().toISOString();

  const { error: requestUpdateError } = await supabaseAdmin
    .from('identity_verification_requests')
    .update({
      status: 'approved',
      reviewed_by: input.adminUserId,
      reviewed_at: reviewedAt,
      rejection_reason: null,
      admin_notes: trimOptional(input.adminNotes, 1200),
    })
    .eq('id', request.id);

  if (requestUpdateError) {
    console.error('[Verification] Failed to approve request:', requestUpdateError);
    throw new VerificationServiceError('Unable to approve verification request', 500);
  }

  const { error: profileUpdateError } = await supabaseAdmin
    .from('profiles')
    .update({
      identity_verification_status: 'verified',
      identity_verification_badge: true,
      identity_verified_at: reviewedAt,
      identity_verified_by: input.adminUserId,
      updated_at: reviewedAt,
    })
    .eq('id', request.user_id);

  if (profileUpdateError) {
    console.error('[Verification] Failed to update approved profile:', profileUpdateError);
    throw new VerificationServiceError('Unable to update verified profile', 500);
  }

  await createNotification({
    userId: request.user_id,
    type: 'system',
    title: 'Identity verification approved',
    body: 'Your account is now ReMarket Verified.',
    linkPath: '/dashboard/settings',
  });

  return getAdminVerificationRequestDetail(request.id);
}

async function setVerificationRequestNeedsUserAction(
  input: AdminVerificationDecisionInput,
  status: 'rejected' | 'resubmission_required'
): Promise<AdminVerificationRequestDetail> {
  const request = await getRequestForDecision(input.requestId);
  const rejectionReason = trimOptional(input.rejectionReason, 800);

  if (!rejectionReason) {
    throw new VerificationServiceError('A user-facing reason is required', 422);
  }

  const reviewedAt = new Date().toISOString();
  const { error: requestUpdateError } = await supabaseAdmin
    .from('identity_verification_requests')
    .update({
      status,
      reviewed_by: input.adminUserId,
      reviewed_at: reviewedAt,
      rejection_reason: rejectionReason,
      admin_notes: trimOptional(input.adminNotes, 1200),
    })
    .eq('id', request.id);

  if (requestUpdateError) {
    console.error('[Verification] Failed to update request decision:', requestUpdateError);
    throw new VerificationServiceError('Unable to update verification request', 500);
  }

  const { error: profileUpdateError } = await supabaseAdmin
    .from('profiles')
    .update({
      identity_verification_status: status,
      identity_verification_badge: false,
      identity_verified_at: null,
      identity_verified_by: null,
      updated_at: reviewedAt,
    })
    .eq('id', request.user_id);

  if (profileUpdateError) {
    console.error('[Verification] Failed to update profile decision:', profileUpdateError);
    throw new VerificationServiceError('Unable to update verification status', 500);
  }

  await createNotification({
    userId: request.user_id,
    type: 'system',
    title:
      status === 'rejected'
        ? 'Identity verification rejected'
        : 'Identity verification needs resubmission',
    body:
      status === 'rejected'
        ? `Your identity verification was rejected: ${rejectionReason}`
        : `Please resubmit clearer identity documents: ${rejectionReason}`,
    linkPath: '/dashboard/settings',
  });

  return getAdminVerificationRequestDetail(request.id);
}

export async function rejectVerificationRequest(
  input: AdminVerificationDecisionInput
): Promise<AdminVerificationRequestDetail> {
  return setVerificationRequestNeedsUserAction(input, 'rejected');
}

export async function requestVerificationResubmission(
  input: AdminVerificationDecisionInput
): Promise<AdminVerificationRequestDetail> {
  return setVerificationRequestNeedsUserAction(input, 'resubmission_required');
}
