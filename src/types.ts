export interface Player {
  id: number
  season: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: string | null
  class_year: string | null
  photo_key: string | null
  sort_order: number
}

export interface BoardMember {
  id: number
  season: string
  role: string
  first_name: string
  last_name: string
  email: string | null
  sort_order: number
}

export type EventStatus = 'draft' | 'published' | 'cancelled'

export interface ClubEvent {
  id: number
  title: string
  description: string | null
  event_type: string
  start_time: string
  end_time: string | null
  location_name: string | null
  location_address: string | null
  status: EventStatus
}

export type MediaType = 'photo' | 'video'

export interface MediaItem {
  id: number
  r2_key: string
  media_type: MediaType
  caption: string | null
  event_id: number | null
  width: number | null
  height: number | null
  duration_seconds: number | null
  sort_order: number
  created_at: string
}

export type UserStatus = 'pending' | 'approved' | 'denied'

export interface AuthUser {
  email: string
  name: string | null
  avatarUrl: string | null
  provider: string
  status: UserStatus
}

export interface PendingUser {
  id: number
  email: string
  name: string | null
  avatar_url: string | null
  provider: string
  status: UserStatus
  requested_at: string
  decided_at: string | null
  decided_by: number | null
}
