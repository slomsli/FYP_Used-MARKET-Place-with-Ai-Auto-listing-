export interface Profile {
  id: string;
  username: string;
  full_name: string;
  phone?: string;
  city?: string;
  avatar_path?: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}
