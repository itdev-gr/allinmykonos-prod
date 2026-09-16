import type { AstroGlobal } from 'astro';
import { createSupabaseAdmin } from './supabase';

/** The signed-in owner's business, or null. */
export async function getOwnerBusiness(locals: App.Locals) {
  const { data } = await locals.supabase
    .from('businesses')
    .select('id, name, slug, status, description, location_area, address, lat, lng, phone, email, website, instagram, logo_url, cover_url, gallery, category_id')
    .eq('owner_id', locals.user!.id)
    .maybeSingle();
  return data;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Upload an image to the public business-media bucket under the owner's
 * folder. Returns the public URL, or null for empty/invalid files.
 */
export async function uploadImage(userId: string, file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = ALLOWED_TYPES[file.type];
  if (!ext || file.size > MAX_IMAGE_BYTES) return null;

  const admin = createSupabaseAdmin();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from('business-media')
    .upload(path, await file.arrayBuffer(), { contentType: file.type });
  if (error) return null;

  return admin.storage.from('business-media').getPublicUrl(path).data.publicUrl;
}

export type { AstroGlobal };
