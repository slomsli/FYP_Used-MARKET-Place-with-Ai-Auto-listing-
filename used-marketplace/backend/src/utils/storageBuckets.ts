export const LISTING_IMAGE_BUCKET =
  process.env.SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  'listing-images';

export const AVATAR_BUCKET =
  process.env.SUPABASE_AVATARS_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET?.trim() ||
  'avatars';

export const DELIVERY_PROOF_BUCKET =
  process.env.SUPABASE_TRANSACTION_PROOFS_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_TRANSACTION_PROOFS_BUCKET?.trim() ||
  'transaction-proofs';

export const MESSAGE_ATTACHMENT_BUCKET =
  process.env.SUPABASE_MESSAGE_ATTACHMENTS_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_MESSAGE_ATTACHMENTS_BUCKET?.trim() ||
  'message-attachments';
