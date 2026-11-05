import { supabase } from './supabase'

/** Upload an image to the public `photos` bucket and return its public URL. Admin only (storage policy). */
export async function uploadPhoto(file: File, folder: 'players' | 'teams'): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('photos').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type || undefined,
  })
  if (error) throw error
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
}
